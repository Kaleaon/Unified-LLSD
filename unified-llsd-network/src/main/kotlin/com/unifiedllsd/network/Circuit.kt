package com.unifiedllsd.network

import java.util.ArrayDeque
import java.util.Queue

data class UnackedPacket(
    val sequenceNumber: Long,
    val packetData: ByteArray,
    var sentTime: Long = System.currentTimeMillis(),
    var retries: Int = 0
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is UnackedPacket) return false
        return sequenceNumber == other.sequenceNumber && packetData.contentEquals(other.packetData)
    }

    override fun hashCode(): Int {
        var result = sequenceNumber.hashCode()
        result = 31 * result + packetData.contentHashCode()
        return result
    }
}

/**
 * Manages UDP circuit sequence numbers, packet acknowledgments, and retransmissions.
 * Thread-safe for background network loop operations.
 */
open class Circuit(val circuitCode: Long) {
    private val lock = Any()
    private var nextOutSequenceNumber: Long = 1
    private val receivedSequences = HashSet<Long>()
    private val pendingAcks: Queue<Long> = ArrayDeque()
    private val unackedPackets = HashMap<Long, UnackedPacket>()

    var isConnected: Boolean = true
        private set

    var lastPacketReceivedTime: Long = System.currentTimeMillis()
        private set

    fun getNextSequenceNumber(): Long = synchronized(lock) {
        return nextOutSequenceNumber++
    }

    fun processInboundPacket(sequenceNumber: Long, reliable: Boolean): Boolean = synchronized(lock) {
        lastPacketReceivedTime = System.currentTimeMillis()

        if (receivedSequences.contains(sequenceNumber)) {
            if (reliable) {
                pendingAcks.add(sequenceNumber)
            }
            return false
        }

        receivedSequences.add(sequenceNumber)

        if (receivedSequences.size > 2048) {
            val min = receivedSequences.minOrNull()
            if (min != null) {
                receivedSequences.remove(min)
            }
        }

        if (reliable) {
            pendingAcks.add(sequenceNumber)
        }

        return true
    }

    fun trackOutgoingPacket(sequenceNumber: Long, packetData: ByteArray) = synchronized(lock) {
        unackedPackets[sequenceNumber] = UnackedPacket(
            sequenceNumber = sequenceNumber,
            packetData = packetData,
            sentTime = System.currentTimeMillis(),
            retries = 0
        )
    }

    fun processAcks(acks: Iterable<Long>) = synchronized(lock) {
        for (ack in acks) {
            unackedPackets.remove(ack)
        }
    }

    fun getPendingAcks(maxCount: Int = 255): List<Long> = synchronized(lock) {
        val result = mutableListOf<Long>()
        while (pendingAcks.isNotEmpty() && result.size < maxCount) {
            result.add(pendingAcks.poll())
        }
        return result
    }

    fun getPacketsToResend(timeoutMillis: Long, maxRetries: Int = 3): List<UnackedPacket> = synchronized(lock) {
        val now = System.currentTimeMillis()
        val resendList = mutableListOf<UnackedPacket>()
        val timedOutKeys = mutableListOf<Long>()

        for ((key, packet) in unackedPackets) {
            if (now - packet.sentTime >= timeoutMillis) {
                if (packet.retries >= maxRetries) {
                    timedOutKeys.add(key)
                } else {
                    packet.retries++
                    packet.sentTime = now
                    resendList.add(packet)
                }
            }
        }

        for (key in timedOutKeys) {
            unackedPackets.remove(key)
        }

        return resendList
    }
}

typealias CircuitManager = Circuit
