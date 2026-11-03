package com.unifiedllsd.network

import com.unifiedllsd.core.LLSD
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class NetworkTest {

    @Test
    fun testCircuitSequenceAndAckTracking() {
        val circuit = Circuit(circuitCode = 123456L)
        assertEquals(123456L, circuit.circuitCode)

        val seq1 = circuit.getNextSequenceNumber()
        val seq2 = circuit.getNextSequenceNumber()
        assertEquals(1L, seq1)
        assertEquals(2L, seq2)

        // Process inbound reliable packet
        val isNew = circuit.processInboundPacket(sequenceNumber = 100L, reliable = true)
        assertTrue(isNew, "First processing of sequence 100 must return true")

        // Duplicate packet check
        val isDuplicate = circuit.processInboundPacket(sequenceNumber = 100L, reliable = true)
        assertFalse(isDuplicate, "Duplicate sequence 100 must return false")

        // Retrieve pending ACKs
        val acks = circuit.getPendingAcks()
        assertTrue(acks.contains(100L))

        // Outgoing packet tracking and ACK processing
        val packetData = byteArrayOf(0x01, 0x02, 0x03)
        circuit.trackOutgoingPacket(sequenceNumber = 10L, packetData = packetData)

        // Process ACK for sequence 10
        circuit.processAcks(listOf(10L))
        val resendList = circuit.getPacketsToResend(timeoutMillis = 0L)
        assertTrue(resendList.isEmpty(), "Acked packet should no longer be pending resend")
    }

    @Test
    fun testCircuitResendTimeout() {
        val circuit = Circuit(circuitCode = 777L)
        val packetData = byteArrayOf(0xAA.toByte(), 0xBB.toByte())
        circuit.trackOutgoingPacket(sequenceNumber = 5L, packetData = packetData)

        // Force timeout check (timeout 0ms)
        val resends = circuit.getPacketsToResend(timeoutMillis = 0L, maxRetries = 3)
        assertEquals(1, resends.size)
        assertEquals(5L, resends[0].sequenceNumber)
        assertEquals(1, resends[0].retries)

        // Exceed max retries
        circuit.getPacketsToResend(timeoutMillis = 0L, maxRetries = 3)
        circuit.getPacketsToResend(timeoutMillis = 0L, maxRetries = 3)
        val afterMaxRetries = circuit.getPacketsToResend(timeoutMillis = 0L, maxRetries = 3)
        assertTrue(afterMaxRetries.isEmpty(), "Timed out packet exceeding max retries should be dropped")
    }

    @Test
    fun testPacketCodecHeaderAndZerocode() {
        // High frequency message ID test
        val flags = (PacketFlags.RELIABLE.toInt() or PacketFlags.ZERO_CODED.toInt()).toByte()
        val rawBuffer = byteArrayOf(
            flags,
            0x00, 0x00, 0x00, 0x05, // Sequence 5
            0x00,                   // Extra bytes count 0
            0x0A                    // Message ID 10 (High freq)
        )

        val (header, headerLen) = PacketCodec.decodeHeader(rawBuffer)
        assertTrue(header.isReliable)
        assertTrue(header.isZeroCoded)
        assertEquals(5L, header.sequenceNumber)
        assertEquals(10L, header.messageId)
        assertEquals(7, headerLen)

        // Zerocode test
        val uncompressed = byteArrayOf(0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x03)
        val encoded = PacketCodec.zeroEncode(uncompressed)

        // Zerodecode test (header length 0 for test)
        val decoded = PacketCodec.zeroDecode(encoded, headerLen = 0)
        assertArrayEquals(uncompressed, decoded)
    }

    @Test
    fun testEventQueueDispatchFlow() = runBlocking {
        val eventQueue = EventQueue()
        val event = EventQueueEvent("TestEvent", LLSD.map("data" to LLSD.string("hello")))

        // Dispatch in background
        eventQueue.dispatchEvent(event)

        val received = eventQueue.events.first()
        assertEquals("TestEvent", received.eventName)
        assertEquals("hello", received.body["data"].asString())
    }
}
