using System;
using System.Buffers.Binary;
using System.Collections.Generic;
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
        public Func<HttpRequestMessage, HttpResponseMessage> Handler { get; set; }

        public MockHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> handler)
        {
            Handler = handler;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return Task.FromResult(Handler(request));
        }
    }

    public class NetworkTests
    {
        [Fact]
        public void TestPacketHeaderDecoding()
        {
            byte[] packet = new byte[] { 0xC0, 0x00, 0x00, 0x03, 0xED, 0x00, 0x05, 0xAA, 0xBB, 0xCC };

            PacketHeader header = PacketCodec.DecodeHeader(packet, out int headerLength);

            Assert.True(header.IsReliable);
            Assert.True(header.IsZeroCoded);
            Assert.False(header.IsResent);
            Assert.False(header.HasAcks);
            Assert.Equal(1005u, header.SequenceNumber);
            Assert.Equal(0u, header.ExtraBytes);
            Assert.Equal(0x05u, header.MessageId);
            Assert.Equal(7, headerLength);
        }

        [Fact]
        public void TestZerocodeExpansionAndCompression()
        {
            byte[] rawBody = new byte[] { 0x01, 0x00, 0x00, 0x00, 0x00, 0x05, 0x00, 0x02 };

            byte[] zeroEncoded = PacketCodec.ZeroEncode(rawBody);
            byte[] zeroDecoded = PacketCodec.ZeroDecode(zeroEncoded, headerLen: 0);

            Assert.Equal(rawBody, zeroDecoded);
        }

        [Fact]
        public void TestCircuitManagerSequenceAndAckTracking()
        {
            var circuit = new CircuitManager(circuitCode: 123456);

            Assert.Equal(1u, circuit.GetNextSequenceNumber());
            Assert.Equal(2u, circuit.GetNextSequenceNumber());

            bool isNew = circuit.ProcessInboundPacket(sequenceNumber: 50, reliable: true);
            Assert.True(isNew);

            bool isDuplicateNew = circuit.ProcessInboundPacket(sequenceNumber: 50, reliable: true);
            Assert.False(isDuplicateNew);

            List<uint> pendingAcks = circuit.GetPendingAcks();
            Assert.Contains(50u, pendingAcks);

            circuit.TrackOutgoingPacket(10, new byte[] { 0x01, 0x02 });
            circuit.ProcessAcks(new uint[] { 10 });

            var resends = circuit.GetPacketsToResend(TimeSpan.FromMilliseconds(10));
            Assert.Empty(resends);
        }

        [Fact]
        public async Task TestEventQueuePollResultAndSequenceTracking()
        {
            string? lastRequestBody = null;
            var handler = new MockHttpMessageHandler(req =>
            {
                lastRequestBody = req.Content?.ReadAsStringAsync().Result;
                var resMap = new Dictionary<string, LLSDValue>
                {
                    ["id"] = LLSDValue.FromInteger(42),
                    ["events"] = LLSDValue.FromArray(new List<LLSDValue>
                    {
                        LLSDValue.FromMap(new Dictionary<string, LLSDValue>
                        {
                            ["message"] = LLSDValue.FromString("TestEvent"),
                            ["body"] = LLSDValue.FromString("event-body")
                        })
                    })
                };
                string xml = LLSDSerialize.ToXML(LLSDValue.FromMap(resMap), true);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(xml, Encoding.UTF8, "application/llsd+xml")
                };
            });

            var httpClient = new HttpClient(handler);
            var capClient = new CapabilityClient(httpClient);

            EventQueuePollResult result = await capClient.PollEventQueueAsync("https://example.com/eq", ack: 10);

            Assert.NotNull(lastRequestBody);
            Assert.Contains("<key>ack</key><integer>10</integer>", lastRequestBody!);
            Assert.Equal(42, result.Id);
            Assert.Equal(42, result.NextAck);
            Assert.Single(result.Events);
            Assert.Equal("TestEvent", result.Events[0].EventName);
            Assert.Equal("event-body", result.Events[0].Body.AsString());
        }

        [Fact]
        public async Task TestContentTypeParsing()
        {
            var testMap = new Dictionary<string, LLSDValue>
            {
                ["message"] = LLSDValue.FromString("BinaryTest")
            };
            byte[] binaryBytes = LLSDSerialize.ToBinary(LLSDValue.FromMap(testMap));

            var handler = new MockHttpMessageHandler(req =>
            {
                var response = new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new ByteArrayContent(binaryBytes)
                };
                response.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/llsd+binary");
                return response;
            });

            var capClient = new CapabilityClient(new HttpClient(handler));
            LLSDValue parsed = await capClient.PostLLSDAsync("https://example.com/cap", LLSDValue.FromMap(new Dictionary<string, LLSDValue>()));

            Assert.True(parsed.IsMap);
            Assert.Equal("BinaryTest", parsed["message"].AsString());
        }

        [Fact]
        public async Task TestEventQueueTimeoutAndBackoffHandling()
        {
            int callCount = 0;
            var handler = new MockHttpMessageHandler(req =>
            {
                callCount++;
                if (callCount == 1)
                {
                    return new HttpResponseMessage(HttpStatusCode.BadGateway)
                    {
                        ReasonPhrase = "Bad Gateway (502)"
                    };
                }
                return new HttpResponseMessage(HttpStatusCode.InternalServerError);
            });

            var capClient = new CapabilityClient(new HttpClient(handler));
            var eqClient = new EventQueueClient(capClient)
            {
                QueueUrl = "https://example.com/eq",
                BaseDelayMs = 1000,
                MaxDelayMs = 30000
            };

            // Call 1: HTTP 502 Bad Gateway -> resets delay to base delay
            await eqClient.PollOnceAsync();
            Assert.Equal(1000, eqClient.CurrentDelayMs);

            // Call 2: HTTP 500 Internal Server Error -> exponential backoff to 2000
            await Assert.ThrowsAsync<HttpRequestException>(async () => await eqClient.PollOnceAsync());
            Assert.Equal(2000, eqClient.CurrentDelayMs);
        }
    }
}
