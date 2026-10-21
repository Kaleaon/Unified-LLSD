import Foundation

public struct PacketFlags: OptionSet {
    public let rawValue: UInt8

    public init(rawValue: UInt8) {
        self.rawValue = rawValue
    }

    public static let none      = PacketFlags([])
    public static let acks      = PacketFlags(rawValue: 0x10)
    public static let resent    = PacketFlags(rawValue: 0x20)
    public static let reliable  = PacketFlags(rawValue: 0x40)
    public static let zeroCoded = PacketFlags(rawValue: 0x80)
}

public struct PacketHeader {
    public var flags: PacketFlags
    public var sequenceNumber: UInt32
    public var extraBytes: UInt8
    public var messageId: UInt32
    public var acks: [UInt32]

    public init(flags: PacketFlags = [], sequenceNumber: UInt32 = 0, extraBytes: UInt8 = 0, messageId: UInt32 = 0, acks: [UInt32] = []) {
        self.flags = flags
        self.sequenceNumber = sequenceNumber
        self.extraBytes = extraBytes
        self.messageId = messageId
        self.acks = acks
    }

    public var isReliable: Bool { flags.contains(.reliable) }
    public var isZeroCoded: Bool { flags.contains(.zeroCoded) }
    public var isResent: Bool { flags.contains(.resent) }
    public var hasAcks: Bool { flags.contains(.acks) }
}

public enum PacketCodec {
    public static func decodeHeader(from data: Data) throws -> (header: PacketHeader, headerLength: Int) {
        guard data.count >= 6 else {
            throw NSError(domain: "PacketCodec", code: 1, userInfo: [NSLocalizedDescriptionKey: "Buffer too small for packet header."])
        }

        let flags = PacketFlags(rawValue: data[data.startIndex])
        let seqBytes = data.subdata(in: (data.startIndex + 1)..<(data.startIndex + 5))
        let seq = seqBytes.withUnsafeBytes { $0.load(as: UInt32.self).bigEndian }
        let extra = data[data.startIndex + 5]

        var header = PacketHeader(flags: flags, sequenceNumber: seq, extraBytes: extra)
        var offset = 6 + Int(extra)

        if offset < data.count {
            let first = data[data.startIndex + offset]
            if first != 0xFF {
                header.messageId = UInt32(first)
                offset += 1
            } else if offset + 1 < data.count && data[data.startIndex + offset + 1] != 0xFF {
                let second = data[data.startIndex + offset + 1]
                header.messageId = UInt32(0xFF00 | UInt32(second))
                offset += 2
            } else if offset + 3 < data.count {
                let msgBytes = data.subdata(in: (data.startIndex + offset)..<(data.startIndex + offset + 4))
                header.messageId = msgBytes.withUnsafeBytes { $0.load(as: UInt32.self).bigEndian }
                offset += 4
            }
        }

        if header.hasAcks && data.count > 0 {
            let ackCount = Int(data[data.startIndex + data.count - 1])
            let ackStart = data.count - 1 - (ackCount * 4)
            if ackStart >= offset {
                for i in 0..<ackCount {
                    let start = ackStart + (i * 4)
                    let ackBytes = data.subdata(in: (data.startIndex + start)..<(data.startIndex + start + 4))
                    let ackSeq = ackBytes.withUnsafeBytes { $0.load(as: UInt32.self).bigEndian }
                    header.acks.append(ackSeq)
                }
            }
        }

        return (header, offset)
    }

    public static func zeroDecode(data: Data, headerLength: Int) -> Data {
        guard data.count > headerLength else { return data }
        var result = Data(data.prefix(headerLength))
        var pos = headerLength
        while pos < data.count {
            let byte = data[pos]
            pos += 1
            if byte == 0x00 {
                if pos < data.count {
                    let zeroCount = Int(data[pos])
                    pos += 1
                    result.append(contentsOf: Array(repeating: UInt8(0), count: zeroCount))
                } else {
                    result.append(0x00)
                }
            } else {
                result.append(byte)
            }
        }
        return result
    }

    public static func zeroEncode(body: Data) -> Data {
        var result = Data()
        var i = 0
        while i < body.count {
            if body[i] == 0x00 {
                let zeroStart = i
                while i < body.count && body[i] == 0x00 && (i - zeroStart) < 255 {
                    i += 1
                }
                let count = UInt8(i - zeroStart)
                result.append(0x00)
                result.append(count)
            } else {
                result.append(body[i])
                i += 1
            }
        }
        return result
    }
}
