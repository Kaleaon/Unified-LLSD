import Foundation

public struct LLURI: Equatable, Hashable, Codable, CustomStringConvertible {
    public var uriString: String

    public init(uriString: String) {
        self.uriString = uriString
    }

    public var description: String {
        return uriString
    }
}
