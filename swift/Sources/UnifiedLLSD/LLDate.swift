import Foundation

public struct LLDate: Equatable, Hashable, CustomStringConvertible, Codable {
    public var secondsSinceEpoch: Double

    public static let null = LLDate(secondsSinceEpoch: 0.0)

    private static let fractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let standardFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    public init(secondsSinceEpoch: Double) {
        self.secondsSinceEpoch = secondsSinceEpoch
    }

    public init?(isoString: String) {
        if let date = LLDate.fractionalFormatter.date(from: isoString) {
            self.secondsSinceEpoch = date.timeIntervalSince1970
        } else if let date = LLDate.standardFormatter.date(from: isoString) {
            self.secondsSinceEpoch = date.timeIntervalSince1970
        } else {
            return nil
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
        return LLDate.standardFormatter.string(from: date)
    }
}

