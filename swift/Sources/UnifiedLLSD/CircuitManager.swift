import Foundation

public struct UnackedPacket {
    public var sequenceNumber: UInt32
    public var packetData: Data
    public var sentTime: Date
    public var retries: Int

    public init(sequenceNumber: UInt32, packetData: Data, sentTime: Date = Date(), retries: Int = 0) {
        self.sequenceNumber = sequenceNumber
        self.packetData = packetData
        self.sentTime = sentTime
        self.retries = retries
    }
}

public class CircuitManager {
    private let lock = NSLock()
    private var nextOutSequenceNumber: UInt32 = 1
    private var receivedSequences = Set<UInt32>()
    private var pendingAcks = [UInt32]()
    private var unackedPackets = [UInt32: UnackedPacket]()

    public let circuitCode: UInt32
    public private(set) var isConnected: Bool = true
    public private(set) var lastPacketReceivedTime: Date = Date()

    public init(circuitCode: UInt32) {
        self.circuitCode = circuitCode
    }

    public func getNextSequenceNumber() -> UInt32 {
        lock.lock()
        defer { lock.unlock() }
        let seq = nextOutSequenceNumber
        nextOutSequenceNumber += 1
        return seq
    }

    public func processInboundPacket(sequenceNumber: UInt32, reliable: Bool) -> Bool {
        lock.lock()
        defer { lock.unlock() }

        lastPacketReceivedTime = Date()

        if receivedSequences.contains(sequenceNumber) {
            if reliable {
                pendingAcks.append(sequenceNumber)
            }
            return false
        }

        receivedSequences.insert(sequenceNumber)

        if receivedSequences.count > 2048 {
            if let minSeq = receivedSequences.min() {
                receivedSequences.remove(minSeq)
            }
        }

        if reliable {
            pendingAcks.append(sequenceNumber)
        }

        return true
    }

    public func trackOutgoingPacket(sequenceNumber: UInt32, packetData: Data) {
        lock.lock()
        defer { lock.unlock() }

        unackedPackets[sequenceNumber] = UnackedPacket(
            sequenceNumber: sequenceNumber,
            packetData: packetData,
            sentTime: Date(),
            retries: 0
        )
    }

    public func processAcks(_ acks: [UInt32]) {
        lock.lock()
        defer { lock.unlock() }

        for ack in acks {
            unackedPackets.removeValue(forKey: ack)
        }
    }

    public func getPendingAcks(maxCount: Int = 255) -> [UInt32] {
        lock.lock()
        defer { lock.unlock() }

        let count = min(maxCount, pendingAcks.count)
        let result = Array(pendingAcks.prefix(count))
        pendingAcks.removeFirst(count)
        return result
    }

    public func getPacketsToResend(timeout: TimeInterval, maxRetries: Int = 3) -> [UnackedPacket] {
        lock.lock()
        defer { lock.unlock() }

        let now = Date()
        var resendList = [UnackedPacket]()
        var timedOutKeys = [UInt32]()

        for (seq, packet) in unackedPackets {
            if now.timeIntervalSince(packet.sentTime) > timeout {
                if packet.retries >= maxRetries {
                    timedOutKeys.append(seq)
                } else {
                    var updated = packet
                    updated.retries += 1
                    updated.sentTime = now
                    unackedPackets[seq] = updated
                    resendList.append(updated)
                }
            }
        }

        for key in timedOutKeys {
            unackedPackets.removeValue(forKey: key)
        }

        return resendList
    }
}
