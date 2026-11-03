package com.firestorm.llcommon.network

import java.time.Duration
import java.time.Instant

data class UnackedPacket(
    val sequenceNumber: Long,
    val packetData: ByteArray = byteArrayOf(),
    var sentTime: Instant = Instant.now(),
    var retries: Int = 0
)

class CircuitManager(val circuitCode: Long) {
    private var nextOutSequenceNumber: Long = 1
    private val receivedSequences = HashSet<Long>()
    private val pendingAcks = ArrayDeque<Long>()
    private val unackedPackets = HashMap<Long, UnackedPacket>()

    var isConnected: Boolean = true
        private set
    var lastPacketReceivedTime: Instant = Instant.now()
        private set

    @Synchronized
    fun getNextSequenceNumber(): Long {
        return nextOutSequenceNumber++
    }

    @Synchronized
    fun processInboundPacket(sequenceNumber: Long, reliable: Boolean): Boolean {
        lastPacketReceivedTime = Instant.now()

        if (receivedSequences.contains(sequenceNumber)) {
            if (reliable) {
                pendingAcks.addLast(sequenceNumber)
            }
            return false
        }

        receivedSequences.add(sequenceNumber)

        if (receivedSequences.size > 2048) {
            val minSeq = receivedSequences.minOrNull()
            if (minSeq != null) {
                receivedSequences.remove(minSeq)
            }
        }

        if (reliable) {
            pendingAcks.addLast(sequenceNumber)
        }

        return true
    }

    @Synchronized
    fun trackOutgoingPacket(sequenceNumber: Long, packetData: ByteArray) {
        unackedPackets[sequenceNumber] = UnackedPacket(
            sequenceNumber = sequenceNumber,
            packetData = packetData,
            sentTime = Instant.now(),
            retries = 0
        )
    }

    @Synchronized
    fun processAcks(acks: Iterable<Long>) {
        for (ack in acks) {
            unackedPackets.remove(ack)
        }
    }

    @Synchronized
    fun getPendingAcks(maxCount: Int = 255): List<Long> {
        val result = mutableListOf<Long>()
        while (pendingAcks.isNotEmpty() && result.size < maxCount) {
            result.add(pendingAcks.removeFirst())
        }
        return result
    }

    @Synchronized
    fun getPacketsToResend(timeout: Duration, maxRetries: Int = 3): List<UnackedPacket> {
        val now = Instant.now()
        val resendList = mutableListOf<UnackedPacket>()
        val timedOutKeys = mutableListOf<Long>()

        for ((seq, packet) in unackedPackets) {
            if (Duration.between(packet.sentTime, now) > timeout) {
                if (packet.retries >= maxRetries) {
                    timedOutKeys.add(seq)
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
