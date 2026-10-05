import Foundation

public enum LLSD: Equatable, Codable {
    case undefined
    case boolean(Bool)
    case integer(Int64) // 64-bit integer
    case real(Double)
    case string(String)
    case uuid(LLUUID)
    case date(LLDate)
    case uri(LLURI)
    case binary(Data)
    case map([String: LLSD])
    case array([LLSD])

    public var isUndefined: Bool {
        if case .undefined = self { return true }
        return false
    }

    public var isDefined: Bool { return !isUndefined }

    public func asBoolean() -> Bool {
        switch self {
        case .boolean(let b): return b
        case .integer(let i): return i != 0
        case .real(let r): return r != 0.0
        case .string(let s): return !s.isEmpty
        case .uuid(let u): return u.notNull
        case .date(let d): return d.notNull
        case .uri(let u): return !u.uriString.isEmpty
        case .binary(let b): return !b.isEmpty
        case .map(let m): return !m.isEmpty
        case .array(let a): return !a.isEmpty
        case .undefined: return false
        }
    }

    public func asInt64() -> Int64 {
        switch self {
        case .integer(let i): return i
        case .boolean(let b): return b ? 1 : 0
        case .real(let r): return Int64(r)
        case .string(let s): return Int64(s) ?? 0
        default: return 0
        }
    }

    public func asDouble() -> Double {
        switch self {
        case .real(let r): return r
        case .integer(let i): return Double(i)
        case .boolean(let b): return b ? 1.0 : 0.0
        case .string(let s): return Double(s) ?? 0.0
        default: return 0.0
        }
    }

    public func asString() -> String {
        switch self {
        case .string(let s): return s
        case .boolean(let b): return b ? "true" : "false"
        case .integer(let i): return String(i)
        case .real(let r): return String(r)
        case .uuid(let u): return u.description
        case .date(let d): return d.description
        case .uri(let u): return u.description
        case .binary(let b): return b.base64EncodedString()
        default: return ""
        }
    }

    public func asUUID() -> LLUUID {
        if case .uuid(let u) = self { return u }
        if case .string(let s) = self, let u = LLUUID(string: s) { return u }
        return LLUUID.null
    }

    public func asDate() -> LLDate {
        if case .date(let d) = self { return d }
        if case .string(let s) = self, let d = LLDate(isoString: s) { return d }
        return LLDate.null
    }

    public subscript(key: String) -> LLSD {
        get {
            if case .map(let m) = self { return m[key] ?? .undefined }
            return .undefined
        }
    }

    public subscript(index: Int) -> LLSD {
        get {
            if case .array(let a) = self, index >= 0, index < a.count { return a[index] }
            return .undefined
        }
    }
}
