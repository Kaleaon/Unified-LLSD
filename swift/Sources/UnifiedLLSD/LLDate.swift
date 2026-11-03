import Foundation

public struct LLDate: Equatable, Hashable, CustomStringConvertible, Codable {
    public var secondsSinceEpoch: Double

    public static let null = LLDate(secondsSinceEpoch: 0.0)

    public init(secondsSinceEpoch: Double) {
        self.secondsSinceEpoch = secondsSinceEpoch
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let str = try? container.decode(String.self), let d = LLDate(isoString: str) {
            self = d
        } else if let sec = try? container.decode(Double.self) {
            self = LLDate(secondsSinceEpoch: sec)
        } else {
            self = LLDate.null
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(description)
    }

    public init?(isoString: String) {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: isoString) {
            self.secondsSinceEpoch = date.timeIntervalSince1970
        } else {
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: isoString) {
                self.secondsSinceEpoch = date.timeIntervalSince1970
            } else {
                return nil
            }
        }
    }

    public var isNull: Bool {
        return secondsSinceEpoch == 0.0
    }

    public var notNull: Bool {
        return !isNull
    }

    public var description: String {
        let date = Date(timeIntervalSince1970: secondsSinceEpoch)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }
}
