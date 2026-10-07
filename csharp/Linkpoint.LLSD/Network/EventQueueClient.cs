using System;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace Linkpoint.LLSD.Network
{
    public class EventQueueClient
    {
        private readonly CapabilityClient _capClient;
        private CancellationTokenSource? _cts;

        public string QueueUrl { get; set; } = string.Empty;
        public int? AckId { get; set; }
        public bool IsPolling { get; private set; }
        public int BaseDelayMs { get; set; } = 1000;
        public int MaxDelayMs { get; set; } = 30000;
        public int CurrentDelayMs { get; private set; } = 1000;

        public event Action<EventQueueEvent>? OnEventReceived;

        public EventQueueClient(CapabilityClient? capClient = null)
        {
            _capClient = capClient ?? new CapabilityClient();
        }

        public void StartPolling(string queueUrl)
        {
            if (string.IsNullOrWhiteSpace(queueUrl)) throw new ArgumentNullException(nameof(queueUrl));
            QueueUrl = queueUrl;
            IsPolling = true;
            CurrentDelayMs = BaseDelayMs;
            AckId = null;

            _cts = new CancellationTokenSource();
            _ = PollLoopAsync(_cts.Token);
        }

        public void StopPolling()
        {
            IsPolling = false;
            _cts?.Cancel();
        }

        public async Task PollOnceAsync(CancellationToken cancellationToken = default)
        {
            try
            {
                var result = await _capClient.PollEventQueueAsync(QueueUrl, AckId, cancellationToken).ConfigureAwait(false);
                CurrentDelayMs = BaseDelayMs;
                if (result.Id.HasValue)
                {
                    AckId = result.Id;
                }
                foreach (var evt in result.Events)
                {
                    OnEventReceived?.Invoke(evt);
                }
            }
            catch (HttpRequestException ex) when (IsBenignTimeout(ex))
            {
                // Benign 502/504 long-poll timeout - reset delay immediately without backoff
                CurrentDelayMs = BaseDelayMs;
            }
            catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                // Read timeout during long poll - reset delay immediately without backoff
                CurrentDelayMs = BaseDelayMs;
            }
            catch (Exception)
            {
                // True network error or 500/503 status code - exponential backoff
                CurrentDelayMs = Math.Min(CurrentDelayMs * 2, MaxDelayMs);
                throw;
            }
        }

        private static bool IsBenignTimeout(HttpRequestException ex)
        {
            string msg = ex.Message ?? string.Empty;
            return msg.Contains("502") || msg.Contains("504") ||
                   msg.Contains("BadGateway") || msg.Contains("GatewayTimeout") ||
                   msg.Contains("Bad Gateway") || msg.Contains("Gateway Timeout");
        }

        private async Task PollLoopAsync(CancellationToken ct)
        {
            while (IsPolling && !ct.IsCancellationRequested)
            {
                try
                {
                    await PollOnceAsync(ct).ConfigureAwait(false);
                }
                catch
                {
                    // Exception handled / backoff updated
                }

                if (IsPolling && !ct.IsCancellationRequested)
                {
                    await Task.Delay(CurrentDelayMs, ct).ConfigureAwait(false);
                }
            }
        }
    }
}
