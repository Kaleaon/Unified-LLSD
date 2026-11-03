package com.firestorm.llcommon

import com.firestorm.llcommon.network.*
import java.time.Duration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NetworkTest {
    @Test
    fun testPacketFlagsBitmaskAlignment() {
        assertEquals(0x80.toByte(), PacketFlags.ZERO_CODED)
        assertEquals(0x40.toByte(), PacketFlags.RELIABLE)
        assertEquals(0x20.toByte(), PacketFlags.RESENT)
        assertEquals(0x10.toByte(), PacketFlags.ACKS)
    }

    @Test
    fun testPacketCodecHeaderAndZeroCoding() {
        val raw = byteArrayOf(0x80.toByte(), 0x00, 0x00, 0x00, 0x01, 0x00, 0x42, 0x00, 0x03, 0x05, 0x06)
        val (header, headerLen) = PacketCodec.decodeHeader(raw)

        assertTrue(header.isZeroCoded)
        assertFalse(header.isReliable)
        assertEquals(1L, header.sequenceNumber)
        assertEquals(0x42L, header.messageId)
        assertEquals(7, headerLen)

        val uncompressed = PacketCodec.zeroDecode(raw, headerLen)
        val expected = byteArrayOf(0x80.toByte(), 0x00, 0x00, 0x00, 0x01, 0x00, 0x42, 0x00, 0x00, 0x00, 0x05, 0x06)
        assertTrue(uncompressed.contentEquals(expected))

        val body = byteArrayOf(0x01, 0x00, 0x00, 0x00, 0x02)
        val compressed = PacketCodec.zeroEncode(body)
        val expectedCompressed = byteArrayOf(0x01, 0x00, 0x03, 0x02)
        assertTrue(compressed.contentEquals(expectedCompressed))
    }

    @Test
    fun testCircuitManagerSequenceAndAcks() {
        val cm = CircuitManager(12345L)
        assertEquals(1L, cm.getNextSequenceNumber())
        assertEquals(2L, cm.getNextSequenceNumber())

        assertTrue(cm.processInboundPacket(100L, true))
        assertFalse(cm.processInboundPacket(100L, true)) // Duplicate

        val pending = cm.getPendingAcks()
        assertEquals(listOf(100L, 100L), pending)

        cm.trackOutgoingPacket(5L, byteArrayOf(1, 2, 3))
        val resendsBeforeTimeout = cm.getPacketsToResend(Duration.ofSeconds(10))
        assertTrue(resendsBeforeTimeout.isEmpty())

        cm.processAcks(listOf(5L))
    }
}
