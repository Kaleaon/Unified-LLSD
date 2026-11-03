using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using Linkpoint.LLSD.Network;

namespace Linkpoint.LLSD.Tests
{
    public class NetworkTests
    {
        [Fact]
        public void TestPacketHeaderDecoding()
        {
            // Build a sample SL UDP packet header:
            // Flags: Reliable | ZeroCoded (0x40 | 0x80 = 0xC0)
            // Sequence: 1005 (0x00, 0x00, 0x03, 0xED)
            // ExtraBytes: 0
            // Message ID: High frequency 0x05
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

            // Raw zerocoded bytes should compress sequence of 0x00
            // Header length = 0 for body only
            byte[] zeroDecoded = PacketCodec.ZeroDecode(zeroEncoded, headerLen: 0);

            Assert.Equal(rawBody, zeroDecoded);
        }

        [Fact]
        public void TestCircuitManagerSequenceAndAckTracking()
        {
            var circuit = new CircuitManager(circuitCode: 123456);

            Assert.Equal(1u, circuit.GetNextSequenceNumber());
            Assert.Equal(2u, circuit.GetNextSequenceNumber());

            // Process inbound reliable packet 50
            bool isNew = circuit.ProcessInboundPacket(sequenceNumber: 50, reliable: true);
            Assert.True(isNew);

            // Process duplicate inbound reliable packet 50
            bool isDuplicateNew = circuit.ProcessInboundPacket(sequenceNumber: 50, reliable: true);
            Assert.False(isDuplicateNew);

            List<uint> pendingAcks = circuit.GetPendingAcks();
            Assert.Contains(50u, pendingAcks);

            // Track outgoing packet 10
            circuit.TrackOutgoingPacket(10, new byte[] { 0x01, 0x02 });

            // Process ACK for 10
            circuit.ProcessAcks(new uint[] { 10 });

            // Ensure no retransmission needed for ACKed packet
            var resends = circuit.GetPacketsToResend(TimeSpan.FromMilliseconds(10));
            Assert.Empty(resends);
        }

        [Fact]
        public void TestCircuitManagerSequenceWindowEviction()
        {
            var circuit = new CircuitManager(circuitCode: 654321);

            // Process 2048 unique inbound sequence numbers (1 to 2048)
            for (uint seq = 1; seq <= 2048; seq++)
            {
                bool isNew = circuit.ProcessInboundPacket(seq, reliable: false);
                Assert.True(isNew);
            }

            // Verify all sequence numbers 1..2048 are detected as duplicates
            for (uint seq = 1; seq <= 2048; seq++)
            {
                bool isNew = circuit.ProcessInboundPacket(seq, reliable: false);
                Assert.False(isNew);
            }

            // Process sequence number 2049. This should evict the oldest entry (seq 1).
            bool is2049New = circuit.ProcessInboundPacket(2049, reliable: false);
            Assert.True(is2049New);

            // Sequence 1 was evicted, so it should now be treated as new if received again.
            // Re-adding 1 will push queue size to 2049, evicting the next oldest sequence (seq 2).
            bool is1NewAfterEviction = circuit.ProcessInboundPacket(1, reliable: false);
            Assert.True(is1NewAfterEviction);

            // Sequence 2 was evicted when sequence 1 was re-added.
            // Sequence 3 is still in the window and should be detected as duplicate.
            bool is3Duplicate = circuit.ProcessInboundPacket(3, reliable: false);
            Assert.False(is3Duplicate);

            // Create a fresh circuit to test window slide with sequential packets 1..2500
            var circuit2 = new CircuitManager(circuitCode: 999999);
            for (uint seq = 1; seq <= 2500; seq++)
            {
                Assert.True(circuit2.ProcessInboundPacket(seq, reliable: false));
            }

            // After receiving 1..2500, window contains 453..2500 (2048 elements).
            // Check duplicate detection for current head/tail of window (2500 and 453).
            Assert.False(circuit2.ProcessInboundPacket(2500, reliable: false));
            Assert.False(circuit2.ProcessInboundPacket(453, reliable: false));

            // Check that sequence 452 (evicted before 453) is treated as new.
            Assert.True(circuit2.ProcessInboundPacket(452, reliable: false));
        }
    }
}
