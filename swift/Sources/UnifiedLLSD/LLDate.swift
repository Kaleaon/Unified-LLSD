import Foundation

public struct LLDate: Equatable, Hashable, CustomStringConvertible, Codable {
    public var secondsSinceEpoch: Double

    public static let null = LLDate(secondsSinceEpoch: 0.0)

    public init(secondsSinceEpoch: Double) {
        self.secondsSinceEpoch = secondsSinceEpoch
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
