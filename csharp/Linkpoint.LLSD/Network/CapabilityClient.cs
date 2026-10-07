using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
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

    public class EventQueuePollResult
    {
        public List<EventQueueEvent> Events { get; set; } = new List<EventQueueEvent>();
        public int? Id { get; set; }
        public int? NextAck => Id;
    }

    /// <summary>
    /// Helper client for Second Life capability requests and EventQueueGet polling.
    /// </summary>
    public class CapabilityClient
    {
        private readonly HttpClient _httpClient;

        public CapabilityClient(HttpClient? httpClient = null)
        {
            _httpClient = httpClient ?? new HttpClient();
        }

        /// <summary>
        /// Request seed capability dictionary or request individual capabilities.
        /// Inspects response Content-Type header to parse binary, XML, or notation LLSD payloads.
        /// </summary>
        public async Task<LLSDValue> PostLLSDAsync(string capabilityUrl, LLSDValue payload, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(capabilityUrl))
            {
                throw new ArgumentNullException(nameof(capabilityUrl));
            }

            string xmlPayload = LLSDSerialize.ToXML(payload, withDeclaration: true);
            using var content = new StringContent(xmlPayload, Encoding.UTF8, "application/llsd+xml");

            using var response = await _httpClient.PostAsync(capabilityUrl, content, cancellationToken).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();

            byte[] responseBytes = await response.Content.ReadAsByteArrayAsync().ConfigureAwait(false);
            string? contentType = response.Content.Headers.ContentType?.MediaType?.ToLowerInvariant();

            if (contentType == "application/llsd+binary")
            {
                return LLSDSerialize.FromBinary(responseBytes);
            }
            if (contentType == "application/llsd+notation" || contentType == "text/plain")
            {
                string text = Encoding.UTF8.GetString(responseBytes);
                return LLSDSerialize.FromNotation(text);
            }
            if (contentType == "application/llsd+xml" || contentType == "text/xml" || contentType == "application/xml")
            {
                string text = Encoding.UTF8.GetString(responseBytes);
                return LLSDSerialize.FromXML(text);
            }

            return LLSDSerialize.Parse(responseBytes);
        }

        /// <summary>
        /// Polls EventQueueGet capability and parses array of events, extracting sequence ID token.
        /// </summary>
        public async Task<EventQueuePollResult> PollEventQueueAsync(string eventQueueUrl, int? ack = null, CancellationToken cancellationToken = default)
        {
            var reqMap = new Dictionary<string, LLSDValue>
            {
                ["done"] = LLSDValue.FromBoolean(false)
            };

            if (ack.HasValue)
            {
                reqMap["ack"] = LLSDValue.FromInteger(ack.Value);
            }

            LLSDValue responseLlsd = await PostLLSDAsync(eventQueueUrl, LLSDValue.FromMap(reqMap), cancellationToken).ConfigureAwait(false);

            var result = new EventQueuePollResult();

            if (responseLlsd.IsMap)
            {
                if (responseLlsd.Has("id"))
                {
                    result.Id = (int)responseLlsd["id"].AsInteger();
                }

                if (responseLlsd.Has("events"))
                {
                    LLSDValue eventsArray = responseLlsd["events"];
                    foreach (LLSDValue evtItem in eventsArray.AsArray())
                    {
                        if (evtItem.IsMap)
                        {
                            result.Events.Add(new EventQueueEvent
                            {
                                EventName = evtItem["message"].AsString(),
                                Body = evtItem["body"]
                            });
                        }
                    }
                }
            }

            return result;
        }
    }
}
