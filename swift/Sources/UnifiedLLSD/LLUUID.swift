import Foundation

public struct LLUUID: Equatable, Hashable, Codable, CustomStringConvertible {
    public var bytes: [UInt8]

    public static let null = LLUUID(bytes: [UInt8](repeating: 0, count: 16))

    public init(bytes: [UInt8]) {
        if bytes.count == 16 {
            self.bytes = bytes
        } else {
            self.bytes = [UInt8](repeating: 0, count: 16)
        }
    }

    public init?(string: String) {
        var result = [UInt8]()
        result.reserveCapacity(16)

        var highNibble: UInt8? = nil

        for byte in string.utf8 {
            switch byte {
            case 0x2D, 0x7B, 0x7D: // '-', '{', '}'
                continue
            case 0x30...0x39: // '0'...'9'
                let val = byte - 0x30
                if let high = highNibble {
                    if result.count == 16 { return nil }
                    result.append((high << 4) | val)
                    highNibble = nil
                } else {
                    highNibble = val
                }
            case 0x61...0x66: // 'a'...'f'
                let val = byte - 0x61 + 10
                if let high = highNibble {
                    if result.count == 16 { return nil }
                    result.append((high << 4) | val)
                    highNibble = nil
                } else {
                    highNibble = val
                }
            case 0x41...0x46: // 'A'...'F'
                let val = byte - 0x41 + 10
                if let high = highNibble {
                    if result.count == 16 { return nil }
                    result.append((high << 4) | val)
                    highNibble = nil
                } else {
                    highNibble = val
                }
            default:
                return nil
            }
        }

        if highNibble != nil || result.count != 16 {
            return nil
        }

        self.bytes = result
    }

    public var isNull: Bool {
        return bytes.allSatisfy { $0 == 0 }
    }

    public var notNull: Bool {
        return !isNull
    }

    public var description: String {
        guard bytes.count == 16 else { return "00000000-0000-0000-0000-000000000000" }
        return String(format: "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
                      bytes[0], bytes[1], bytes[2], bytes[3],
                      bytes[4], bytes[5],
                      bytes[6], bytes[7],
                      bytes[8], bytes[9],
                      bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15])
    }
}
