using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Linkpoint.LLSD.Network;

namespace Linkpoint.LLSD.Tests
{
    public class MockHttpMessageHandler : HttpMessageHandler
    {
        public List<HttpRequestMessage> Requests { get; } = new List<HttpRequestMessage>();
        public List<byte[]> RequestBodies { get; } = new List<byte[]>();
        public Queue<Func<HttpRequestMessage, HttpResponseMessage>> Responses { get; } = new Queue<Func<HttpRequestMessage, HttpResponseMessage>>();
        public Exception? ExceptionToThrow { get; set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (request.Content != null)
            {
                byte[] bodyBytes = await request.Content.ReadAsByteArrayAsync().ConfigureAwait(false);
                RequestBodies.Add(bodyBytes);
            }
            else
            {
                RequestBodies.Add(Array.Empty<byte>());
            }
            Requests.Add(request);

            if (ExceptionToThrow != null)
            {
                throw ExceptionToThrow;
            }

            if (Responses.Count > 0)
            {
                return Responses.Dequeue()(request);
            }

            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(LLSDSerialize.ToXML(LLSDValue.FromString("ok")), Encoding.UTF8, "application/llsd+xml")
            };
        }
    }

    public class CapabilityClientTests
    {
        [Fact]
        public async Task TestPostLLSDAsyncFormatsAndHeaders()
        {
            var handler = new MockHttpMessageHandler();
            var client = new CapabilityClient(new HttpClient(handler));

            var payloadMap = new Dictionary<string, LLSDValue>
            {
                ["message"] = LLSDValue.FromString("Hello World"),
                ["value"] = LLSDValue.FromInteger(123)
            };
            LLSDValue payload = LLSDValue.FromMap(payloadMap);

            var formats = new (LLSDFormat format, string expectedContentType)[]
            {
                (LLSDFormat.Xml, "application/llsd+xml"),
                (LLSDFormat.Binary, "application/llsd+binary"),
                (LLSDFormat.Notation, "application/llsd+notation"),
                (LLSDFormat.Json, "application/llsd+json")
            };

            foreach (var (format, expectedContentType) in formats)
            {
                handler.Requests.Clear();
                handler.RequestBodies.Clear();
                handler.Responses.Clear();

                handler.Responses.Enqueue(req => new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(LLSDSerialize.ToXML(LLSDValue.FromString("response_ok")), Encoding.UTF8, "application/llsd+xml")
                });

                LLSDValue response = await client.PostLLSDAsync("http://localhost/cap", payload, format);

                Assert.Equal(1, handler.Requests.Count);
                HttpRequestMessage req = handler.Requests[0];

                Assert.Equal(expectedContentType, req.Content!.Headers.ContentType?.MediaType);

                byte[] sentBytes = handler.RequestBodies[0];
                LLSDValue parsedSentPayload = LLSDSerialize.Parse(sentBytes);

                Assert.True(parsedSentPayload.IsMap);
                Assert.Equal("Hello World", parsedSentPayload["message"].AsString());
                Assert.Equal(123, parsedSentPayload["value"].AsInteger());
                Assert.Equal("response_ok", response.AsString());
            }
        }

        [Fact]
        public async Task TestTransientStatusCodeRetriesAndRecovery()
        {
            var handler = new MockHttpMessageHandler();
            var options = new CapabilityClientOptions
            {
                BaseDelay = TimeSpan.FromMilliseconds(1),
                MaxBackoffDelay = TimeSpan.FromMilliseconds(10),
                MaxRetryCount = 3,
                EnableJitter = false
            };
            var client = new CapabilityClient(new HttpClient(handler), options);

            int callCount = 0;
            handler.Responses.Enqueue(req => { callCount++; return new HttpResponseMessage((HttpStatusCode)503); });
            handler.Responses.Enqueue(req => { callCount++; return new HttpResponseMessage((HttpStatusCode)429); });
            handler.Responses.Enqueue(req => { callCount++; return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(LLSDSerialize.ToXML(LLSDValue.FromString("recovered")), Encoding.UTF8, "application/llsd+xml")
            }; });

            LLSDValue response = await client.PostLLSDAsync("http://localhost/cap", LLSDValue.FromBoolean(true));

            Assert.Equal(3, callCount);
            Assert.Equal(3, handler.Requests.Count);
            Assert.Equal("recovered", response.AsString());
        }

        [Fact]
        public async Task TestTransientErrorMaxRetriesExceeded()
        {
            var handler = new MockHttpMessageHandler();
            var options = new CapabilityClientOptions
            {
                BaseDelay = TimeSpan.FromMilliseconds(1),
                MaxRetryCount = 2,
                EnableJitter = false
            };
            var client = new CapabilityClient(new HttpClient(handler), options);

            for (int i = 0; i < 5; i++)
            {
                handler.Responses.Enqueue(req => new HttpResponseMessage((HttpStatusCode)504));
            }

            await Assert.ThrowsAsync<HttpRequestException>(async () =>
            {
                await client.PostLLSDAsync("http://localhost/cap", LLSDValue.FromBoolean(true));
            });

            Assert.Equal(3, handler.Requests.Count); // 1 initial + 2 retries
        }

        [Fact]
        public async Task TestNonTransientErrorFailsFast()
        {
            var handler = new MockHttpMessageHandler();
            var options = new CapabilityClientOptions
            {
                BaseDelay = TimeSpan.FromMilliseconds(1),
                MaxRetryCount = 3
            };
            var client = new CapabilityClient(new HttpClient(handler), options);

            handler.Responses.Enqueue(req => new HttpResponseMessage(HttpStatusCode.BadRequest)); // 400 Bad Request

            await Assert.ThrowsAsync<HttpRequestException>(async () =>
            {
                await client.PostLLSDAsync("http://localhost/cap", LLSDValue.FromBoolean(true));
            });

            Assert.Equal(1, handler.Requests.Count); // Failed fast, 0 retries
        }

        [Fact]
        public async Task TestNetworkExceptionRetry()
        {
            var handler = new MockHttpMessageHandler();
            var options = new CapabilityClientOptions
            {
                BaseDelay = TimeSpan.FromMilliseconds(1),
                MaxRetryCount = 2
            };
            var client = new CapabilityClient(new HttpClient(handler), options);

            int callIndex = 0;
            handler.Responses.Enqueue(req =>
            {
                callIndex++;
                throw new HttpRequestException("Socket error");
            });
            handler.Responses.Enqueue(req =>
            {
                callIndex++;
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(LLSDSerialize.ToXML(LLSDValue.FromInteger(999)), Encoding.UTF8, "application/llsd+xml")
                };
            });

            LLSDValue response = await client.PostLLSDAsync("http://localhost/cap", LLSDValue.FromBoolean(true));

            Assert.Equal(2, callIndex);
            Assert.Equal(999, response.AsInteger());
        }

        [Fact]
        public async Task TestFastCancellation()
        {
            var handler = new MockHttpMessageHandler();
            var client = new CapabilityClient(new HttpClient(handler));

            using var cts = new CancellationTokenSource();
            cts.Cancel();

            await Assert.ThrowsAsync<OperationCanceledException>(async () =>
            {
                await client.PostLLSDAsync("http://localhost/cap", LLSDValue.FromBoolean(true), cancellationToken: cts.Token);
            });

            Assert.Equal(0, handler.Requests.Count);
        }

        [Fact]
        public async Task TestPollEventQueueAsyncWithFormat()
        {
            var handler = new MockHttpMessageHandler();
            var client = new CapabilityClient(new HttpClient(handler));

            var eventMap = new Dictionary<string, LLSDValue>
            {
                ["events"] = LLSDValue.FromArray(new List<LLSDValue>
                {
                    LLSDValue.FromMap(new Dictionary<string, LLSDValue>
                    {
                        ["message"] = LLSDValue.FromString("AgentOnline"),
                        ["body"] = LLSDValue.FromMap(new Dictionary<string, LLSDValue>
                        {
                            ["agent_id"] = LLSDValue.FromString("11111111-2222-3333-4444-555555555555")
                        })
                    })
                })
            };
            LLSDValue responseLlsd = LLSDValue.FromMap(eventMap);

            handler.Responses.Enqueue(req => new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(LLSDSerialize.ToBinary(responseLlsd, includeHeader: true))
                {
                    Headers = { ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/llsd+binary") }
                }
            });

            List<EventQueueEvent> events = await client.PollEventQueueAsync("http://localhost/event_queue", ack: 10, format: LLSDFormat.Binary);

            Assert.Equal(1, handler.Requests.Count);
            HttpRequestMessage req = handler.Requests[0];
            Assert.Equal("application/llsd+binary", req.Content!.Headers.ContentType?.MediaType);

            Assert.Equal(1, events.Count);
            Assert.Equal("AgentOnline", events[0].EventName);
            Assert.True(events[0].Body.IsMap);
            Assert.Equal("11111111-2222-3333-4444-555555555555", events[0].Body["agent_id"].AsString());
        }

        [Fact]
        public void TestBackoffDelayAndJitterCalculation()
        {
            var optionsNoJitter = new CapabilityClientOptions
            {
                BaseDelay = TimeSpan.FromMilliseconds(500),
                MaxBackoffDelay = TimeSpan.FromMilliseconds(3000),
                EnableJitter = false
            };

            Assert.Equal(TimeSpan.FromMilliseconds(500), CapabilityClient.CalculateBackoffDelay(1, optionsNoJitter));
            Assert.Equal(TimeSpan.FromMilliseconds(1000), CapabilityClient.CalculateBackoffDelay(2, optionsNoJitter));
            Assert.Equal(TimeSpan.FromMilliseconds(2000), CapabilityClient.CalculateBackoffDelay(3, optionsNoJitter));
            Assert.Equal(TimeSpan.FromMilliseconds(3000), CapabilityClient.CalculateBackoffDelay(4, optionsNoJitter)); // Capped at MaxBackoffDelay

            var optionsWithJitter = new CapabilityClientOptions
            {
                BaseDelay = TimeSpan.FromMilliseconds(500),
                MaxBackoffDelay = TimeSpan.FromMilliseconds(10000),
                EnableJitter = true
            };

            TimeSpan delayWithJitter = CapabilityClient.CalculateBackoffDelay(1, optionsWithJitter);
            Assert.True(delayWithJitter.TotalMilliseconds >= 400 && delayWithJitter.TotalMilliseconds <= 600);
        }
    }
}
