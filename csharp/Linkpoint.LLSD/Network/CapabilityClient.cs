using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Linkpoint.LLSD.Network
{
    public class EventQueueEvent
    {
        public string EventName { get; set; } = string.Empty;
        public LLSDValue Body { get; set; } = LLSDValue.Undefined;
    }

    /// <summary>
    /// Configuration options for <see cref="CapabilityClient"/>.
    /// </summary>
    public class CapabilityClientOptions
    {
        public LLSDFormat DefaultFormat { get; set; } = LLSDFormat.Xml;
        public int MaxRetryCount { get; set; } = 3;
        public TimeSpan BaseDelay { get; set; } = TimeSpan.FromMilliseconds(500);
        public TimeSpan MaxBackoffDelay { get; set; } = TimeSpan.FromMilliseconds(10000);
        public bool EnableJitter { get; set; } = true;
    }

    /// <summary>
    /// Helper client for Second Life capability requests and EventQueueGet polling.
    /// </summary>
    public class CapabilityClient
    {
        private static readonly Random JitterRandom = new Random();

        private readonly HttpClient _httpClient;

        public CapabilityClientOptions Options { get; }

        public CapabilityClient(HttpClient? httpClient = null, CapabilityClientOptions? options = null)
        {
            _httpClient = httpClient ?? new HttpClient();
            Options = options ?? new CapabilityClientOptions();
        }

        public CapabilityClient(CapabilityClientOptions options)
            : this(null, options)
        {
        }

        /// <summary>
        /// Request seed capability dictionary or request individual capabilities.
        /// </summary>
        public Task<LLSDValue> PostLLSDAsync(string capabilityUrl, LLSDValue payload, CancellationToken cancellationToken)
        {
            return PostLLSDAsync(capabilityUrl, payload, format: null, cancellationToken: cancellationToken);
        }

        /// <summary>
        /// Request seed capability dictionary or request individual capabilities using specified LLSD format.
        /// </summary>
        public async Task<LLSDValue> PostLLSDAsync(
            string capabilityUrl,
            LLSDValue payload,
            LLSDFormat? format = null,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(capabilityUrl))
            {
                throw new ArgumentNullException(nameof(capabilityUrl));
            }

            LLSDFormat effectiveFormat = format ?? Options.DefaultFormat;
            int maxRetries = Math.Max(0, Options.MaxRetryCount);
            int attempt = 0;

            while (true)
            {
                cancellationToken.ThrowIfCancellationRequested();

                using HttpContent content = CreateHttpContent(payload, effectiveFormat);
                HttpResponseMessage? response = null;
                Exception? caughtException = null;

                try
                {
                    response = await _httpClient.PostAsync(capabilityUrl, content, cancellationToken).ConfigureAwait(false);
                }
                catch (Exception ex) when (ex is HttpRequestException || ex is IOException || (ex is OperationCanceledException && !cancellationToken.IsCancellationRequested))
                {
                    caughtException = ex;
                }

                if (response != null)
                {
                    if (response.IsSuccessStatusCode)
                    {
                        try
                        {
                            byte[] responseBytes = await response.Content.ReadAsByteArrayAsync().ConfigureAwait(false);
                            return LLSDSerialize.Parse(responseBytes);
                        }
                        finally
                        {
                            response.Dispose();
                        }
                    }

                    int statusCode = (int)response.StatusCode;
                    bool isTransient = IsTransientStatusCode(statusCode);

                    if (!isTransient || attempt >= maxRetries)
                    {
                        try
                        {
                            response.EnsureSuccessStatusCode();
                        }
                        finally
                        {
                            response.Dispose();
                        }
                    }

                    response.Dispose();
                }
                else if (caughtException != null)
                {
                    if (attempt >= maxRetries)
                    {
                        throw caughtException;
                    }
                }

                attempt++;
                TimeSpan delay = CalculateBackoffDelay(attempt, Options);
                await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
            }
        }

        /// <summary>
        /// Polls EventQueueGet capability and parses array of events.
        /// </summary>
        public Task<List<EventQueueEvent>> PollEventQueueAsync(string eventQueueUrl, int ack, CancellationToken cancellationToken)
        {
            return PollEventQueueAsync(eventQueueUrl, ack, format: null, cancellationToken: cancellationToken);
        }

        /// <summary>
        /// Polls EventQueueGet capability and parses array of events using specified LLSD format.
        /// </summary>
        public async Task<List<EventQueueEvent>> PollEventQueueAsync(
            string eventQueueUrl,
            int ack = 0,
            LLSDFormat? format = null,
            CancellationToken cancellationToken = default)
        {
            var reqMap = new Dictionary<string, LLSDValue>
            {
                ["ack"] = LLSDValue.FromInteger(ack),
                ["done"] = LLSDValue.FromBoolean(false)
            };

            LLSDValue responseLlsd = await PostLLSDAsync(eventQueueUrl, LLSDValue.FromMap(reqMap), format, cancellationToken).ConfigureAwait(false);

            var events = new List<EventQueueEvent>();
            if (responseLlsd.IsMap && responseLlsd.Has("events"))
            {
                LLSDValue eventsArray = responseLlsd["events"];
                foreach (LLSDValue evtItem in eventsArray.AsArray())
                {
                    if (evtItem.IsMap)
                    {
                        events.Add(new EventQueueEvent
                        {
                            EventName = evtItem["message"].AsString(),
                            Body = evtItem["body"]
                        });
                    }
                }
            }

            return events;
        }

        public static HttpContent CreateHttpContent(LLSDValue payload, LLSDFormat format)
        {
            switch (format)
            {
                case LLSDFormat.Binary:
                    byte[] binaryData = LLSDSerialize.ToBinary(payload, includeHeader: true);
                    var byteContent = new ByteArrayContent(binaryData);
                    byteContent.Headers.ContentType = new MediaTypeHeaderValue("application/llsd+binary");
                    return byteContent;

                case LLSDFormat.Notation:
                    string notationData = LLSDSerialize.ToNotation(payload, includeHeader: true);
                    return new StringContent(notationData, Encoding.UTF8, "application/llsd+notation");

                case LLSDFormat.Json:
                    string jsonData = LLSDSerialize.ToJSON(payload);
                    return new StringContent(jsonData, Encoding.UTF8, "application/llsd+json");

                case LLSDFormat.Xml:
                default:
                    string xmlData = LLSDSerialize.ToXML(payload, withDeclaration: true);
                    return new StringContent(xmlData, Encoding.UTF8, "application/llsd+xml");
            }
        }

        public static bool IsTransientStatusCode(int statusCode)
        {
            return statusCode == 429 || statusCode == 502 || statusCode == 503 || statusCode == 504;
        }

        public static TimeSpan CalculateBackoffDelay(int retryAttempt, CapabilityClientOptions options)
        {
            if (retryAttempt <= 0) return TimeSpan.Zero;

            double baseMs = options.BaseDelay.TotalMilliseconds;
            if (baseMs <= 0) return TimeSpan.Zero;

            double maxMs = options.MaxBackoffDelay.TotalMilliseconds;
            if (maxMs <= 0) return TimeSpan.Zero;

            double exponent = Math.Min(retryAttempt - 1, 30);
            double exponentialMs = baseMs * Math.Pow(2, exponent);
            double delayMs = Math.Min(exponentialMs, maxMs);

            if (options.EnableJitter)
            {
                lock (JitterRandom)
                {
                    double jitterFactor = 0.8 + (JitterRandom.NextDouble() * 0.4); // 80% to 120%
                    delayMs = Math.Min(delayMs * jitterFactor, maxMs);
                }
            }

            return TimeSpan.FromMilliseconds(Math.Max(0, delayMs));
        }
    }
}
