import Foundation

public struct LLUUID: Equatable, Hashable, CustomStringConvertible, Codable {
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
        let clean = string.replacingOccurrences(of: "-", with: "")
            .replacingOccurrences(of: "{", with: "")
            .replacingOccurrences(of: "}", with: "")
        guard clean.count == 32 else { return nil }

        var result = [UInt8]()
        result.reserveCapacity(16)
        var index = clean.startIndex
        for _ in 0..<16 {
            let nextIndex = clean.index(index, offsetBy: 2)
            guard let byte = UInt8(clean[index..<nextIndex], radix: 16) else { return nil }
            result.append(byte)
            index = nextIndex
        }
        self.bytes = result
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let str = try container.decode(String.self)
        if let uuid = LLUUID(string: str) {
            self = uuid
        } else {
            self = LLUUID.null
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(description)
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
