package com.unifiedllsd.network

import java.nio.ByteBuffer
import java.nio.ByteOrder

object PacketFlags {
    const val NONE: Byte = 0x00
    const val ACKS: Byte = 0x10
    const val RESENT: Byte = 0x20
    const val RELIABLE: Byte = 0x40
    const val ZERO_CODED: Byte = 0x80.toByte()
}

data class PacketHeader(
    var flags: Byte = 0,
    var sequenceNumber: Long = 0,
    var extraBytes: Byte = 0,
    var messageId: Long = 0,
    val acks: MutableList<Long> = mutableListOf()
) {
    val isReliable: Boolean get() = (flags.toInt() and 0x40) != 0
    val isZeroCoded: Boolean get() = (flags.toInt() and 0x80) != 0
    val isResent: Boolean get() = (flags.toInt() and 0x20) != 0
    val hasAcks: Boolean get() = (flags.toInt() and 0x10) != 0
}

/**
 * Helper for Second Life UDP packet header encoding/decoding and Zerocoded expansion.
 */
object PacketCodec {

    fun decodeHeader(buffer: ByteArray, offset: Int = 0): Pair<PacketHeader, Int> {
        if (buffer.size - offset < 6) {
            throw IllegalArgumentException("Buffer too small for packet header.")
        }

        val flags = buffer[offset]
        val sequenceNumber = ByteBuffer.wrap(buffer, offset + 1, 4).order(ByteOrder.BIG_ENDIAN).int.toLong() and 0xFFFFFFFFL
        val extraBytes = buffer[offset + 5]

        val header = PacketHeader(
            flags = flags,
            sequenceNumber = sequenceNumber,
            extraBytes = extraBytes
        )

        var pos = offset + 6 + (extraBytes.toInt() and 0xFF)

        if (pos < buffer.size) {
            val first = buffer[pos].toInt() and 0xFF
            if (first != 0xFF) {
                // High frequency (1 byte)
                header.messageId = first.toLong()
                pos += 1
            } else if (pos + 1 < buffer.size && (buffer[pos + 1].toInt() and 0xFF) != 0xFF) {
                // Medium frequency (2 bytes)
                val second = buffer[pos + 1].toInt() and 0xFF
                header.messageId = ((0xFF shl 8) or second).toLong()
                pos += 2
            } else if (pos + 3 < buffer.size) {
                // Low frequency (4 bytes)
                header.messageId = ByteBuffer.wrap(buffer, pos, 4).order(ByteOrder.BIG_ENDIAN).int.toLong() and 0xFFFFFFFFL
                pos += 4
            }
        }

        if (header.hasAcks && buffer.isNotEmpty()) {
            val ackCount = buffer[buffer.size - 1].toInt() and 0xFF
            val ackStart = buffer.size - 1 - (ackCount * 4)
            if (ackStart >= pos) {
                for (i in 0 until ackCount) {
                    val ackSeq = ByteBuffer.wrap(buffer, ackStart + (i * 4), 4).order(ByteOrder.BIG_ENDIAN).int.toLong() and 0xFFFFFFFFL
                    header.acks.add(ackSeq)
                }
            }
        }

        return Pair(header, pos)
    }

    fun zeroDecode(src: ByteArray, headerLen: Int): ByteArray {
        if (src.size <= headerLen) return src.copyOf()

        val dst = ArrayList<Byte>(src.size * 2)
        for (i in 0 until headerLen) {
            dst.add(src[i])
        }

        var pos = headerLen
        while (pos < src.size) {
            val b = src[pos++]
            if (b == 0.toByte()) {
                if (pos < src.size) {
                    val zeroCount = src[pos++].toInt() and 0xFF
                    for (z in 0 until zeroCount) {
                        dst.add(0.toByte())
                    }
                } else {
                    dst.add(0.toByte())
                }
            } else {
                dst.add(b)
            }
        }

        return dst.toByteArray()
    }

    fun zeroEncode(body: ByteArray): ByteArray {
        val dst = ArrayList<Byte>(body.size)
        var i = 0
        while (i < body.size) {
            if (body[i] == 0.toByte()) {
                val zeroStart = i
                while (i < body.size && body[i] == 0.toByte() && (i - zeroStart) < 255) {
                    i++
                }
                val count = i - zeroStart
                dst.add(0.toByte())
                dst.add(count.toByte())
            } else {
                dst.add(body[i++])
            }
        }
        return dst.toByteArray()
    }
}
