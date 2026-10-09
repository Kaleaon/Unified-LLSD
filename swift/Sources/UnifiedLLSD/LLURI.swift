import Foundation

public struct LLURI: Equatable, Hashable, CustomStringConvertible, Codable {
    public var uriString: String

    public init(uriString: String) {
        self.uriString = uriString
    }

    public var description: String {
        return uriString
    }
}
