import Foundation

public struct LLURI: Equatable, Hashable, CustomStringConvertible, Codable {
    public var uriString: String

    public init(uriString: String) {
        self.uriString = uriString
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        self.uriString = try container.decode(String.self)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(uriString)
    }

    public var description: String {
        return uriString
    }
}
