import Foundation

public struct LLSDSerialize {
    public static let binaryHeader = "<? llsd/binary ?>\n"
    public static let notationHeader = "<? llsd/notation ?>\n"
    public static let xmlHeader = "<?xml version=\"1.0\" ?>\n"

    // --- XML ---
    public static func toXML(_ sd: LLSD, withDeclaration: Bool = false) -> String {
        var xml = withDeclaration ? xmlHeader : ""
        xml += "<llsd>"
        xml += writeXmlElement(sd)
        xml += "</llsd>"
        return xml
    }

    private static func writeXmlElement(_ sd: LLSD) -> String {
        switch sd {
        case .undefined: return "<undef/>"
        case .boolean(let b): return "<boolean>\(b ? "true" : "false")</boolean>"
        case .integer(let i): return "<integer>\(i)</integer>"
        case .real(let r):
            if r.isNaN { return "<real>nan</real>" }
            if r.isInfinite { return "<real>\(r > 0 ? "inf" : "-inf")</real>" }
            return "<real>\(r)</real>"
        case .string(let s): return s.isEmpty ? "<string/>" : "<string>\(xmlEscape(s))</string>"
        case .uuid(let u): return u.isNull ? "<uuid/>" : "<uuid>\(u.description)</uuid>"
        case .date(let d): return d.isNull ? "<date/>" : "<date>\(d.description)</date>"
        case .uri(let u): return u.uriString.isEmpty ? "<uri/>" : "<uri>\(xmlEscape(u.description))</uri>"
        case .binary(let b): return b.isEmpty ? "<binary/>" : "<binary encoding=\"base64\">\(b.base64EncodedString())</binary>"
        case .map(let m):
            if m.isEmpty { return "<map/>" }
            var res = "<map>"
            for (k, v) in m {
                res += "<key>\(xmlEscape(k))</key>"
                res += writeXmlElement(v)
            }
            res += "</map>"
            return res
        case .array(let a):
            if a.isEmpty { return "<array/>" }
            var res = "<array>"
            for v in a {
                res += writeXmlElement(v)
            }
            res += "</array>"
            return res
        }
    }

    public static func xmlEscape(_ s: String) -> String {
        return s.replacingOccurrences(of: "&", with: "&amp;")
                .replacingOccurrences(of: "<", with: "&lt;")
                .replacingOccurrences(of: ">", with: "&gt;")
                .replacingOccurrences(of: "\"", with: "&quot;")
                .replacingOccurrences(of: "'", with: "&apos;")
    }

    public static func xmlUnescape(_ s: String) -> String {
        var res = s.replacingOccurrences(of: "&lt;", with: "<")
                   .replacingOccurrences(of: "&gt;", with: ">")
                   .replacingOccurrences(of: "&quot;", with: "\"")
                   .replacingOccurrences(of: "&apos;", with: "'")
                   .replacingOccurrences(of: "&#39;", with: "'")
                   .replacingOccurrences(of: "&amp;", with: "&")
        if res.contains("&#") {
            res = decodeNumericEntities(res)
        }
        return res
    }

    private static func decodeNumericEntities(_ s: String) -> String {
        var result = ""
        var index = s.startIndex
        while index < s.endIndex {
            if s[index] == "&" {
                let rest = s[index...]
                if rest.hasPrefix("&#x") || rest.hasPrefix("&#X") {
                    if let semi = rest.firstIndex(of: ";") {
                        let numStart = s.index(index, offsetBy: 3)
                        let numStr = String(s[numStart..<semi])
                        if let codePoint = UInt32(numStr, radix: 16), let scalar = UnicodeScalar(codePoint) {
                            result.append(Character(scalar))
                            index = s.index(after: semi)
                            continue
                        }
                    }
                } else if rest.hasPrefix("&#") {
                    if let semi = rest.firstIndex(of: ";") {
                        let numStart = s.index(index, offsetBy: 2)
                        let numStr = String(s[numStart..<semi])
                        if let codePoint = UInt32(numStr, radix: 10), let scalar = UnicodeScalar(codePoint) {
                            result.append(Character(scalar))
                            index = s.index(after: semi)
                            continue
                        }
                    }
                }
            }
            result.append(s[index])
            index = s.index(after: index)
        }
        return result
    }

    public static func fromXML(_ xml: String) -> LLSD {
        let parser = LLSDXMLParser(input: xml)
        return parser.parse()
    }

    // --- Binary ---
    public static func toBinary(_ sd: LLSD) -> Data {
        var data = Data()
        writeBinary(&data, sd)
        return data
    }

    private static func writeBinary(_ data: inout Data, _ sd: LLSD) {
        switch sd {
        case .undefined: data.append(33) // '!'
        case .boolean(let b): data.append(b ? 49 : 48) // '1' or '0'
        case .integer(let i):
            data.append(105) // 'i'
            var be32 = Int32(i).bigEndian
            withUnsafeBytes(of: &be32) { data.append(contentsOf: $0) }
        case .real(let r):
            data.append(114) // 'r'
            var bitPattern = r.bitPattern.bigEndian
            withUnsafeBytes(of: &bitPattern) { data.append(contentsOf: $0) }
        case .date(let d):
            data.append(100) // 'd'
            // Date is LE 8-byte double!
            var bitPattern = d.secondsSinceEpoch.bitPattern.littleEndian
            withUnsafeBytes(of: &bitPattern) { data.append(contentsOf: $0) }
        default: data.append(33)
        }
    }

    public static func fromBinary(_ data: Data) -> LLSD {
        guard !data.isEmpty else { return .undefined }
        let tag = data[0]
        if tag == 33 { return .undefined }
        if tag == 49 { return .boolean(true) }
        if tag == 48 { return .boolean(false) }
        if tag == 105 && data.count >= 5 {
            let be32 = data.subdata(in: 1..<5).withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian
            return .integer(Int64(be32))
        }
        if tag == 100 && data.count >= 9 {
            let le64 = data.subdata(in: 1..<9).withUnsafeBytes { $0.load(as: UInt64.self) }.littleEndian
            let doubleVal = Double(bitPattern: le64)
            return .date(LLDate(secondsSinceEpoch: doubleVal))
        }
        return .undefined
    }

    // --- Notation ---
    public static func toNotation(_ sd: LLSD) -> String {
        switch sd {
        case .undefined: return "!"
        case .boolean(let b): return b ? "true" : "false"
        case .integer(let i): return "i\(i)"
        case .real(let r): return "r\(r)"
        case .string(let s): return "'\(s)'"
        default: return "!"
        }
    }

    public static func fromNotation(_ text: String) -> LLSD {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if clean == "!" { return .undefined }
        if clean.hasPrefix("i") {
            if let i = Int64(clean.dropFirst()) { return .integer(i) }
        }
        return .undefined
    }
}

private class LLSDXMLParser {
    struct TagToken {
        let name: String
        let attributes: [String: String]
        let isEnd: Bool
        let isSelfClosing: Bool
    }

    private let input: String
    private var index: String.Index
    private static let maxDepth = 256

    init(input: String) {
        self.input = input
        self.index = input.startIndex
    }

    func parse() -> LLSD {
        while index < input.endIndex {
            skipWhitespaceAndComments()
            if index >= input.endIndex { break }
            if input[index] == "<" {
                if let tag = readTagToken() {
                    if tag.isEnd { continue }
                    if tag.name.lowercased() == "llsd" {
                        if tag.isSelfClosing { return .undefined }
                        return parseValue(depth: 0)
                    } else {
                        return parseElement(tag: tag, depth: 0)
                    }
                }
            } else {
                index = input.index(after: index)
            }
        }
        return .undefined
    }

    private func parseValue(depth: Int) -> LLSD {
        guard depth <= LLSDXMLParser.maxDepth else { return .undefined }
        while index < input.endIndex {
            skipWhitespaceAndComments()
            if index >= input.endIndex { break }
            if input[index] == "<" {
                let saved = index
                if let tag = readTagToken() {
                    if tag.isEnd {
                        if tag.name.lowercased() == "llsd" { return .undefined }
                        return .undefined
                    }
                    return parseElement(tag: tag, depth: depth)
                } else {
                    index = saved
                    break
                }
            } else {
                index = input.index(after: index)
            }
        }
        return .undefined
    }

    private func parseElement(tag: TagToken, depth: Int) -> LLSD {
        guard depth <= LLSDXMLParser.maxDepth else { return .undefined }
        let name = tag.name.lowercased()

        if tag.isSelfClosing {
            switch name {
            case "undef": return .undefined
            case "boolean": return .boolean(false)
            case "integer": return .integer(0)
            case "real": return .real(0.0)
            case "string": return .string("")
            case "uuid": return .uuid(.null)
            case "date": return .date(.null)
            case "uri": return .uri(LLURI(uriString: ""))
            case "binary": return .binary(Data())
            case "map": return .map([:])
            case "array": return .array([])
            default: return .undefined
            }
        }

        switch name {
        case "undef":
            _ = readContentUntilEndTag(name)
            return .undefined
        case "boolean":
            let raw = readContentUntilEndTag(name).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return .boolean(raw == "true" || raw == "1")
        case "integer":
            let raw = readContentUntilEndTag(name).trimmingCharacters(in: .whitespacesAndNewlines)
            return .integer(Int64(raw) ?? 0)
        case "real":
            let raw = readContentUntilEndTag(name).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if raw == "nan" { return .real(Double.nan) }
            if raw == "inf" || raw == "+inf" { return .real(Double.infinity) }
            if raw == "-inf" { return .real(-Double.infinity) }
            return .real(Double(raw) ?? 0.0)
        case "string":
            let raw = readContentUntilEndTag(name)
            return .string(LLSDSerialize.xmlUnescape(raw))
        case "uuid":
            let raw = readContentUntilEndTag(name).trimmingCharacters(in: .whitespacesAndNewlines)
            return .uuid(LLUUID(string: raw) ?? .null)
        case "date":
            let raw = readContentUntilEndTag(name).trimmingCharacters(in: .whitespacesAndNewlines)
            return .date(LLDate(isoString: raw) ?? .null)
        case "uri":
            let raw = readContentUntilEndTag(name).trimmingCharacters(in: .whitespacesAndNewlines)
            return .uri(LLURI(uriString: LLSDSerialize.xmlUnescape(raw)))
        case "binary":
            let raw = readContentUntilEndTag(name)
                .replacingOccurrences(of: "\n", with: "")
                .replacingOccurrences(of: "\r", with: "")
                .replacingOccurrences(of: " ", with: "")
                .replacingOccurrences(of: "\t", with: "")
            let data = Data(base64Encoded: raw) ?? Data()
            return .binary(data)
        case "map":
            var map = [String: LLSD]()
            while index < input.endIndex {
                skipWhitespaceAndComments()
                if index >= input.endIndex { break }
                if input[index] == "<" {
                    guard let childTag = readTagToken() else { break }
                    if childTag.isEnd {
                        if childTag.name.lowercased() == "map" {
                            return .map(map)
                        }
                        continue
                    }
                    if childTag.name.lowercased() == "key" {
                        let keyName: String
                        if childTag.isSelfClosing {
                            keyName = ""
                        } else {
                            let rawKey = readContentUntilEndTag("key")
                            keyName = LLSDSerialize.xmlUnescape(rawKey)
                        }
                        let val = parseValue(depth: depth + 1)
                        map[keyName] = val
                    }
                } else {
                    index = input.index(after: index)
                }
            }
            return .map(map)
        case "array":
            var array = [LLSD]()
            while index < input.endIndex {
                skipWhitespaceAndComments()
                if index >= input.endIndex { break }
                if input[index] == "<" {
                    guard let childTag = readTagToken() else { break }
                    if childTag.isEnd {
                        if childTag.name.lowercased() == "array" {
                            return .array(array)
                        }
                        continue
                    }
                    let childVal = parseElement(tag: childTag, depth: depth + 1)
                    array.append(childVal)
                } else {
                    index = input.index(after: index)
                }
            }
            return .array(array)
        default:
            return .undefined
        }
    }

    private func skipWhitespaceAndComments() {
        while index < input.endIndex {
            let ch = input[index]
            if ch == " " || ch == "\t" || ch == "\r" || ch == "\n" {
                index = input.index(after: index)
                continue
            }
            if ch == "<" {
                let rest = input[index...]
                if rest.hasPrefix("<!--") {
                    if let end = rest.range(of: "-->") {
                        index = end.upperBound
                        continue
                    } else {
                        index = input.endIndex
                        break
                    }
                }
                if rest.hasPrefix("<?") {
                    if let end = rest.range(of: "?>") {
                        index = end.upperBound
                        continue
                    } else {
                        index = input.endIndex
                        break
                    }
                }
            }
            break
        }
    }

    private func readTagToken() -> TagToken? {
        guard index < input.endIndex, input[index] == "<" else { return nil }
        guard let close = input[index...].firstIndex(of: ">") else { return nil }
        let tagStr = String(input[input.index(after: index)..<close]).trimmingCharacters(in: .whitespacesAndNewlines)
        index = input.index(after: close)

        if tagStr.hasPrefix("/") {
            let name = String(tagStr.dropFirst()).trimmingCharacters(in: .whitespacesAndNewlines)
            return TagToken(name: name, attributes: [:], isEnd: true, isSelfClosing: false)
        }

        var isSelfClosing = false
        var content = tagStr
        if content.hasSuffix("/") {
            isSelfClosing = true
            content = String(content.dropLast()).trimmingCharacters(in: .whitespacesAndNewlines)
        }

        let parts = content.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }
        guard let tagName = parts.first else { return nil }

        var attrs = [String: String]()
        if parts.count > 1 {
            let attrString = content.dropFirst(tagName.count).trimmingCharacters(in: .whitespacesAndNewlines)
            let attrPairs = attrString.components(separatedBy: " ")
            for pair in attrPairs {
                let kv = pair.components(separatedBy: "=")
                if kv.count == 2 {
                    let k = kv[0].trimmingCharacters(in: .whitespacesAndNewlines)
                    let v = kv[1].trimmingCharacters(in: CharacterSet(charactersIn: "\"'\t\r\n "))
                    attrs[k] = v
                }
            }
        }

        return TagToken(name: tagName, attributes: attrs, isEnd: false, isSelfClosing: isSelfClosing)
    }

    private func readContentUntilEndTag(_ tagName: String) -> String {
        var content = ""
        let endTagLower = "</" + tagName.lowercased() + ">"
        let endTagLowerWithSpace = "</" + tagName.lowercased() + " "

        while index < input.endIndex {
            let rest = input[index...].lowercased()
            if rest.hasPrefix(endTagLower) || rest.hasPrefix(endTagLowerWithSpace) {
                if let close = input[index...].firstIndex(of: ">") {
                    index = input.index(after: close)
                }
                break
            }

            if input[index...].hasPrefix("<![CDATA[") {
                index = input.index(index, offsetBy: 9)
                if let endRange = input[index...].range(of: "]]>") {
                    content.append(contentsOf: input[index..<endRange.lowerBound])
                    index = endRange.upperBound
                } else {
                    content.append(contentsOf: input[index...])
                    index = input.endIndex
                }
                continue
            }

            if input[index...].hasPrefix("<!--") {
                if let endRange = input[index...].range(of: "-->") {
                    index = endRange.upperBound
                } else {
                    index = input.endIndex
                }
                continue
            }

            content.append(input[index])
            index = input.index(after: index)
        }
        return content
    }
}
