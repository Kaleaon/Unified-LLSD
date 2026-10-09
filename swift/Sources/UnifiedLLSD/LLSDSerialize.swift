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
        case .date(let d): return "<date>\(d.description)</date>"
        case .uri(let u): return "<uri>\(xmlEscape(u.uriString))</uri>"
        case .binary(let b): return "<binary encoding=\"base64\">\(b.base64EncodedString())</binary>"
        case .map(let m):
            var res = "<map>"
            for (k, v) in m {
                res += "<key>\(xmlEscape(k))</key>"
                res += writeXmlElement(v)
            }
            res += "</map>"
            return res
        case .array(let a):
            var res = "<array>"
            for v in a {
                res += writeXmlElement(v)
            }
            res += "</array>"
            return res
        }
    }

    private static func xmlEscape(_ s: String) -> String {
        return s.replacingOccurrences(of: "&", with: "&amp;")
                .replacingOccurrences(of: "<", with: "&lt;")
                .replacingOccurrences(of: ">", with: "&gt;")
                .replacingOccurrences(of: "\"", with: "&quot;")
    }

    private static func xmlUnescape(_ s: String) -> String {
        return s.replacingOccurrences(of: "&quot;", with: "\"")
                .replacingOccurrences(of: "&gt;", with: ">")
                .replacingOccurrences(of: "&lt;", with: "<")
                .replacingOccurrences(of: "&amp;", with: "&")
    }

    public static func fromXML(_ xml: String) -> LLSD {
        var clean = xml.trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.isEmpty { return .undefined }
        if clean.hasPrefix("<?xml") {
            if let range = clean.range(of: "?>") {
                clean = String(clean[range.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
        if clean.hasPrefix("<llsd>") && clean.hasSuffix("</llsd>") {
            clean = String(clean.dropFirst(6).dropLast(7)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return parseXmlValue(clean)
    }

    private static func parseXmlValue(_ xml: String) -> LLSD {
        let clean = xml.trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.isEmpty { return .undefined }

        if clean.hasPrefix("<undef/>") || clean.hasPrefix("<undef />") { return .undefined }

        if let match = regexMatch(clean, pattern: "^<boolean\\s*>(.*?)</boolean>") {
            let v = match.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return .boolean(v == "true" || v == "1" || v == "t")
        }

        if let match = regexMatch(clean, pattern: "^<integer\\s*>(.*?)</integer>") {
            if let i = Int64(match.trimmingCharacters(in: .whitespacesAndNewlines)) {
                return .integer(i)
            }
        }

        if let match = regexMatch(clean, pattern: "^<real\\s*>(.*?)</real>") {
            let v = match.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if v == "nan" { return .real(Double.nan) }
            if v == "inf" || v == "+inf" || v == "infinity" { return .real(Double.infinity) }
            if v == "-inf" || v == "-infinity" { return .real(-Double.infinity) }
            if let d = Double(v) { return .real(d) }
        }

        if clean.hasPrefix("<string/>") || clean.hasPrefix("<string />") { return .string("") }
        if let match = regexMatch(clean, pattern: "^<string\\s*>(.*?)</string>") {
            return .string(xmlUnescape(match))
        }

        if clean.hasPrefix("<uuid/>") || clean.hasPrefix("<uuid />") { return .uuid(LLUUID.null) }
        if let match = regexMatch(clean, pattern: "^<uuid\\s*>(.*?)</uuid>") {
            if let u = LLUUID(string: match.trimmingCharacters(in: .whitespacesAndNewlines)) {
                return .uuid(u)
            }
        }

        if let match = regexMatch(clean, pattern: "^<date\\s*>(.*?)</date>") {
            if let d = LLDate(isoString: match.trimmingCharacters(in: .whitespacesAndNewlines)) {
                return .date(d)
            }
        }

        if let match = regexMatch(clean, pattern: "^<uri\\s*>(.*?)</uri>") {
            return .uri(LLURI(uriString: xmlUnescape(match.trimmingCharacters(in: .whitespacesAndNewlines))))
        }

        if clean.hasPrefix("<binary/>") || clean.hasPrefix("<binary />") { return .binary(Data()) }
        if let (encoding, content) = parseBinaryXml(clean) {
            if encoding == "base16" {
                var bytes = [UInt8]()
                var index = content.startIndex
                while index < content.endIndex {
                    let nextIndex = content.index(index, offsetBy: 2, limitedBy: content.endIndex) ?? content.endIndex
                    if let byte = UInt8(content[index..<nextIndex], radix: 16) {
                        bytes.append(byte)
                    }
                    index = nextIndex
                }
                return .binary(Data(bytes))
            } else {
                if let data = Data(base64Encoded: content) {
                    return .binary(data)
                }
            }
        }

        if clean.hasPrefix("<map>") || clean.hasPrefix("<map/>") {
            if clean.hasPrefix("<map/>") { return .map([:]) }
            var map = [String: LLSD]()
            if let range = clean.range(of: "</map>", options: .backwards) {
                var inner = String(clean[clean.index(clean.startIndex, offsetBy: 5)..<range.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
                while !inner.isEmpty {
                    guard let keyMatch = regexMatch(inner, pattern: "^<key\\s*>(.*?)</key>") else { break }
                    let key = xmlUnescape(keyMatch)
                    if let keyTagRange = inner.range(of: "</key>") {
                        inner = String(inner[keyTagRange.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
                    } else { break }

                    let valEndIdx = findMatchingXmlEndTag(inner)
                    guard valEndIdx > 0 else { break }
                    let valXml = String(inner[..<inner.index(inner.startIndex, offsetBy: valEndIdx)])
                    map[key] = parseXmlValue(valXml)
                    inner = String(inner[inner.index(inner.startIndex, offsetBy: valEndIdx)...]).trimmingCharacters(in: .whitespacesAndNewlines)
                }
            }
            return .map(map)
        }

        if clean.hasPrefix("<array>") || clean.hasPrefix("<array/>") {
            if clean.hasPrefix("<array/>") { return .array([]) }
            var arr = [LLSD]()
            if let range = clean.range(of: "</array>", options: .backwards) {
                var inner = String(clean[clean.index(clean.startIndex, offsetBy: 7)..<range.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
                while !inner.isEmpty {
                    let valEndIdx = findMatchingXmlEndTag(inner)
                    guard valEndIdx > 0 else { break }
                    let valXml = String(inner[..<inner.index(inner.startIndex, offsetBy: valEndIdx)])
                    arr.append(parseXmlValue(valXml))
                    inner = String(inner[inner.index(inner.startIndex, offsetBy: valEndIdx)...]).trimmingCharacters(in: .whitespacesAndNewlines)
                }
            }
            return .array(arr)
        }

        return .undefined
    }

    private static func regexMatch(_ str: String, pattern: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators]) else { return nil }
        let nsString = str as NSString
        guard let match = regex.firstMatch(in: str, options: [], range: NSRange(location: 0, length: nsString.length)),
              match.numberOfRanges > 1 else { return nil }
        return nsString.substring(with: match.range(at: 1))
    }

    private static func parseBinaryXml(_ str: String) -> (String, String)? {
        guard let regex = try? NSRegularExpression(pattern: "^<binary(?:\\s+encoding=\"([^\"]*)\")?\\s*>(.*?)</binary>", options: [.dotMatchesLineSeparators]) else { return nil }
        let nsString = str as NSString
        guard let match = regex.firstMatch(in: str, options: [], range: NSRange(location: 0, length: nsString.length)) else { return nil }
        let enc = match.range(at: 1).location != NSNotFound ? nsString.substring(with: match.range(at: 1)).lowercased() : "base64"
        let content = nsString.substring(with: match.range(at: 2)).trimmingCharacters(in: .whitespacesAndNewlines)
        return (enc, content)
    }

    private static func findMatchingXmlEndTag(_ xml: String) -> Int {
        let clean = xml.trimmingCharacters(in: .whitespaces)
        guard clean.hasPrefix("<") else { return -1 }
        let spaceIdx = clean.firstIndex(of: " ")
        let closeAngleIdx = clean.firstIndex(of: ">")
        guard let closeAngle = closeAngleIdx else { return -1 }

        var tagName = ""
        if let space = spaceIdx, space < closeAngle {
            tagName = String(clean[clean.index(after: clean.startIndex)..<space])
        } else {
            tagName = String(clean[clean.index(after: clean.startIndex)..<closeAngle])
        }
        if tagName.hasSuffix("/") || clean[..<clean.index(after: closeAngle)].hasSuffix("/>") {
            return clean.distance(from: clean.startIndex, to: clean.index(after: closeAngle))
        }

        let closingTag = "</\(tagName)>"
        var depth = 0
        var pos = clean.startIndex

        while pos < clean.endIndex {
            let sub = clean[pos...]
            guard let nextCloseRange = sub.range(of: closingTag) else { return -1 }
            let nextOpenRange = sub.range(of: "<\(tagName)")

            if let nextOpen = nextOpenRange, nextOpen.lowerBound < nextCloseRange.lowerBound {
                if let endOpenAngle = clean[nextOpen.lowerBound...].firstIndex(of: ">") {
                    if clean[clean.index(before: endOpenAngle)] != "/" {
                        depth += 1
                    }
                    pos = clean.index(after: endOpenAngle)
                } else {
                    return -1
                }
            } else {
                depth -= 1
                pos = nextCloseRange.upperBound
                if depth == 0 {
                    return clean.distance(from: clean.startIndex, to: pos)
                }
            }
        }
        return -1
    }

    // --- Binary ---
    public static func toBinary(_ sd: LLSD) -> Data {
        var data = Data()
        writeBinary(&data, sd)
        return data
    }

    private static func writeBinary(_ data: inout Data, _ sd: LLSD) {
        switch sd {
        case .undefined:
            data.append(33) // '!'
        case .boolean(let b):
            data.append(b ? 49 : 48) // '1' or '0'
        case .integer(let i):
            data.append(105) // 'i'
            var be32 = Int32(truncatingIfNeeded: i).bigEndian
            withUnsafeBytes(of: &be32) { data.append(contentsOf: $0) }
        case .real(let r):
            data.append(114) // 'r'
            var bitPattern = r.bitPattern.bigEndian
            withUnsafeBytes(of: &bitPattern) { data.append(contentsOf: $0) }
        case .string(let s):
            data.append(115) // 's'
            let utf8 = Data(s.utf8)
            var len32 = Int32(utf8.count).bigEndian
            withUnsafeBytes(of: &len32) { data.append(contentsOf: $0) }
            data.append(utf8)
        case .uuid(let u):
            data.append(117) // 'u'
            data.append(contentsOf: u.bytes)
        case .date(let d):
            data.append(100) // 'd'
            var bitPattern = d.secondsSinceEpoch.bitPattern.littleEndian
            withUnsafeBytes(of: &bitPattern) { data.append(contentsOf: $0) }
        case .uri(let u):
            data.append(108) // 'l'
            let utf8 = Data(u.uriString.utf8)
            var len32 = Int32(utf8.count).bigEndian
            withUnsafeBytes(of: &len32) { data.append(contentsOf: $0) }
            data.append(utf8)
        case .binary(let b):
            data.append(98) // 'b'
            var len32 = Int32(b.count).bigEndian
            withUnsafeBytes(of: &len32) { data.append(contentsOf: $0) }
            data.append(b)
        case .map(let m):
            data.append(123) // '{'
            var count32 = Int32(m.count).bigEndian
            withUnsafeBytes(of: &count32) { data.append(contentsOf: $0) }
            for (k, v) in m {
                data.append(107) // 'k'
                let kUtf8 = Data(k.utf8)
                var kLen32 = Int32(kUtf8.count).bigEndian
                withUnsafeBytes(of: &kLen32) { data.append(contentsOf: $0) }
                data.append(kUtf8)
                writeBinary(&data, v)
            }
            data.append(125) // '}'
        case .array(let a):
            data.append(91) // '['
            var count32 = Int32(a.count).bigEndian
            withUnsafeBytes(of: &count32) { data.append(contentsOf: $0) }
            for item in a {
                writeBinary(&data, item)
            }
            data.append(93) // ']'
        }
    }

    public static func fromBinary(_ data: Data) -> LLSD {
        guard !data.isEmpty else { return .undefined }
        var offset = 0
        if data.count >= 2 && data[0] == 60 && data[1] == 63 { // '<?'
            for i in 0..<data.count {
                if data[i] == 10 { // '\n'
                    offset = i + 1;
                    break;
                }
            }
        }
        let res = readBinaryValue(data, offset: offset)
        return res.value
    }

    private struct ReadResult {
        let value: LLSD
        let offset: Int
    }

    private static func readBinaryValue(_ data: Data, offset: Int) -> ReadResult {
        guard offset < data.count else { return ReadResult(value: .undefined, offset: offset) }
        var pos = offset
        let tag = data[pos]
        pos += 1

        switch tag {
        case 33: // '!'
            return ReadResult(value: .undefined, offset: pos)
        case 49: // '1'
            return ReadResult(value: .boolean(true), offset: pos)
        case 48: // '0'
            return ReadResult(value: .boolean(false), offset: pos)
        case 105: // 'i'
            guard pos + 4 <= data.count else { return ReadResult(value: .undefined, offset: data.count) }
            let be32 = data.subdata(in: pos..<pos+4).withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian
            return ReadResult(value: .integer(Int64(be32)), offset: pos + 4)
        case 114: // 'r'
            guard pos + 8 <= data.count else { return ReadResult(value: .undefined, offset: data.count) }
            let be64 = data.subdata(in: pos..<pos+8).withUnsafeBytes { $0.load(as: UInt64.self) }.bigEndian
            let doubleVal = Double(bitPattern: be64)
            return ReadResult(value: .real(doubleVal), offset: pos + 8)
        case 115: // 's'
            guard pos + 4 <= data.count else { return ReadResult(value: .undefined, offset: data.count) }
            let len32 = Int(data.subdata(in: pos..<pos+4).withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian)
            pos += 4
            guard pos + len32 <= data.count else { return ReadResult(value: .undefined, offset: data.count) }
            let strData = data.subdata(in: pos..<pos+len32)
            let str = String(data: strData, encoding: .utf8) ?? ""
            return ReadResult(value: .string(str), offset: pos + len32)
        case 117: // 'u'
            guard pos + 16 <= data.count else { return ReadResult(value: .undefined, offset: data.count) }
            let bytes = Array(data.subdata(in: pos..<pos+16))
            return ReadResult(value: .uuid(LLUUID(bytes: bytes)), offset: pos + 16)
        case 100: // 'd'
            guard pos + 8 <= data.count else { return ReadResult(value: .undefined, offset: data.count) }
            let le64 = data.subdata(in: pos..<pos+8).withUnsafeBytes { $0.load(as: UInt64.self) }.littleEndian
            let doubleVal = Double(bitPattern: le64)
            return ReadResult(value: .date(LLDate(secondsSinceEpoch: doubleVal)), offset: pos + 8)
        case 108: // 'l'
            guard pos + 4 <= data.count else { return ReadResult(value: .undefined, offset: data.count) }
            let len32 = Int(data.subdata(in: pos..<pos+4).withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian)
            pos += 4
            guard pos + len32 <= data.count else { return ReadResult(value: .undefined, offset: data.count) }
            let strData = data.subdata(in: pos..<pos+len32)
            let str = String(data: strData, encoding: .utf8) ?? ""
            return ReadResult(value: .uri(LLURI(uriString: str)), offset: pos + len32)
        case 98: // 'b'
            guard pos + 4 <= data.count else { return ReadResult(value: .undefined, offset: data.count) }
            let len32 = Int(data.subdata(in: pos..<pos+4).withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian)
            pos += 4
            guard pos + len32 <= data.count else { return ReadResult(value: .undefined, offset: data.count) }
            let binData = data.subdata(in: pos..<pos+len32)
            return ReadResult(value: .binary(binData), offset: pos + len32)
        case 123: // '{'
            guard pos + 4 <= data.count else { return ReadResult(value: .undefined, offset: data.count) }
            let count = Int(data.subdata(in: pos..<pos+4).withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian)
            pos += 4
            var map = [String: LLSD]()
            for _ in 0..<count {
                guard pos < data.count else { break }
                let kTag = data[pos]
                pos += 1
                guard kTag == 107 else { return ReadResult(value: .undefined, offset: data.count) } // 'k'
                guard pos + 4 <= data.count else { return ReadResult(value: .undefined, offset: data.count) }
                let kLen = Int(data.subdata(in: pos..<pos+4).withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian)
                pos += 4
                guard pos + kLen <= data.count else { return ReadResult(value: .undefined, offset: data.count) }
                let keyStr = String(data: data.subdata(in: pos..<pos+kLen), encoding: .utf8) ?? ""
                pos += kLen

                let valRes = readBinaryValue(data, offset: pos)
                map[keyStr] = valRes.value
                pos = valRes.offset
            }
            if pos < data.count && data[pos] == 125 { // '}'
                pos += 1
            }
            return ReadResult(value: .map(map), offset: pos)
        case 91: // '['
            guard pos + 4 <= data.count else { return ReadResult(value: .undefined, offset: data.count) }
            let count = Int(data.subdata(in: pos..<pos+4).withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian)
            pos += 4
            var arr = [LLSD]()
            for _ in 0..<count {
                let valRes = readBinaryValue(data, offset: pos)
                arr.append(valRes.value)
                pos = valRes.offset
            }
            if pos < data.count && data[pos] == 93 { // ']'
                pos += 1
            }
            return ReadResult(value: .array(arr), offset: pos)
        default:
            return ReadResult(value: .undefined, offset: pos)
        }
    }

    // --- Notation ---
    public static func toNotation(_ sd: LLSD) -> String {
        switch sd {
        case .undefined:
            return "!"
        case .boolean(let b):
            return b ? "true" : "false"
        case .integer(let i):
            return "i\(i)"
        case .real(let r):
            if r.isNaN { return "rnan" }
            if r.isInfinite { return r > 0 ? "rinf" : "r-inf" }
            return "r\(r)"
        case .string(let s):
            return "'\(notationEscape(s))'"
        case .uuid(let u):
            return "u\(u.description)"
        case .date(let d):
            return "d\"\(d.description)\""
        case .uri(let u):
            return "l\"\(notationEscapeDouble(u.uriString))\""
        case .binary(let b):
            return "b64\"\(b.base64EncodedString())\""
        case .map(let m):
            let pairs = m.map { "'\(notationEscape($0.key))':\(toNotation($0.value))" }
            return "{\(pairs.joined(separator: ","))}"
        case .array(let a):
            let items = a.map { toNotation($0) }
            return "[\(items.joined(separator: ","))]"
        }
    }

    private static func notationEscape(_ s: String) -> String {
        return s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
    }

    private static func notationEscapeDouble(_ s: String) -> String {
        return s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
    }

    public static func fromNotation(_ text: String) -> LLSD {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.isEmpty { return .undefined }
        var input = clean
        if input.hasPrefix("<?llsd/notation?>") || input.hasPrefix("<? llsd/notation ?>") {
            if let range = input.range(of: "\n") {
                input = String(input[range.upperBound...])
            }
        }
        return SwiftNotationParser(input).parse()
    }
}

private class SwiftNotationParser {
    private let text: String
    private var index: String.Index

    init(_ text: String) {
        self.text = text
        self.index = text.startIndex
    }

    func parse() -> LLSD {
        skipWs()
        return parseValue()
    }

    private func skipWs() {
        while index < text.endIndex && text[index].isWhitespace {
            index = text.index(after: index)
        }
    }

    private func peek() -> Character? {
        return index < text.endIndex ? text[index] : nil
    }

    private func peekAt(_ offset: Int) -> Character? {
        guard let idx = text.index(index, offsetBy: offset, limitedBy: text.endIndex), idx < text.endIndex else { return nil }
        return text[idx]
    }

    @discardableResult
    private func consume() -> Character {
        let c = text[index]
        index = text.index(after: index)
        return c
    }

    private func expect(_ c: Character) {
        if index < text.endIndex && text[index] == c {
            index = text.index(after: index)
        }
    }

    func parseValue() -> LLSD {
        skipWs()
        guard let c = peek() else { return .undefined }

        if c == "!" {
            consume()
            return .undefined
        }
        if c == "T" || c == "t" { return parseBoolWord(true) }
        if c == "F" || c == "f" { return parseBoolWord(false) }
        if c == "1" { consume(); return .boolean(true) }
        if c == "0" { consume(); return .boolean(false) }
        if c == "i" {
            consume()
            let numStr = parseNumberWord()
            return .integer(Int64(numStr) ?? 0)
        }
        if c == "r" {
            consume()
            let word = parseNumberWord()
            let wLower = word.lowercased()
            if wLower == "nan" { return .real(Double.nan) }
            if wLower == "inf" || wLower == "+inf" { return .real(Double.infinity) }
            if wLower == "-inf" { return .real(-Double.infinity) }
            return .real(Double(word) ?? 0.0)
        }
        if c == "u" {
            consume()
            let uuidStr = parseUuidLiteral()
            if let u = LLUUID(string: uuidStr) {
                return .uuid(u)
            }
            return .uuid(LLUUID.null)
        }
        if c == "d" {
            consume()
            let str = parseQuotedAfterTag()
            if let d = LLDate(isoString: str) {
                return .date(d)
            }
            return .date(LLDate.null)
        }
        if c == "l" {
            consume()
            let str = parseQuotedAfterTag()
            return .uri(LLURI(uriString: str))
        }
        if c == "b" { return parseBinaryNotation() }
        if c == "s" { return parseSizedString() }
        if c == "'" { return .string(parseSingleQuoted()) }
        if c == "\"" { return .string(parseDoubleQuoted()) }
        if c == "{" { return parseMap() }
        if c == "[" { return parseArray() }

        consume()
        return .undefined
    }

    private func parseBoolWord(_ val: Bool) -> LLSD {
        let word = val ? "true" : "false"
        if let endIdx = text.index(index, offsetBy: word.count, limitedBy: text.endIndex) {
            let sub = String(text[index..<endIdx])
            if sub.lowercased() == word {
                index = endIdx
            } else {
                consume()
            }
        } else {
            consume()
        }
        return .boolean(val)
    }

    private func parseNumberWord() -> String {
        let start = index
        while index < text.endIndex {
            let c = text[index]
            if c.isWhitespace || c == "," || c == "}" || c == "]" { break }
            index = text.index(after: index)
        }
        return String(text[start..<index])
    }

    private func parseUuidLiteral() -> String {
        skipWs()
        if peek() == "\"" { return parseDoubleQuoted() }
        if peek() == "'" { return parseSingleQuoted() }
        let start = index
        let end = text.index(index, offsetBy: 36, limitedBy: text.endIndex) ?? text.endIndex
        index = end
        return String(text[start..<end])
    }

    private func parseQuotedAfterTag() -> String {
        skipWs()
        if peek() == "\"" { return parseDoubleQuoted() }
        if peek() == "'" { return parseSingleQuoted() }
        return ""
    }

    private func parseDoubleQuoted() -> String {
        expect("\"")
        var res = ""
        while index < text.endIndex && text[index] != "\"" {
            if text[index] == "\\" {
                let nextIdx = text.index(after: index)
                if nextIdx < text.endIndex {
                    index = nextIdx
                    res.append(decodeEscape(text[index]))
                }
            } else {
                res.append(text[index])
            }
            index = text.index(after: index)
        }
        if index < text.endIndex { consume() }
        return res
    }

    private func parseSingleQuoted() -> String {
        expect("'")
        var res = ""
        while index < text.endIndex && text[index] != "'" {
            if text[index] == "\\" {
                let nextIdx = text.index(after: index)
                if nextIdx < text.endIndex {
                    index = nextIdx
                    res.append(decodeEscape(text[index]))
                }
            } else {
                res.append(text[index])
            }
            index = text.index(after: index)
        }
        if index < text.endIndex { consume() }
        return res
    }

    private func decodeEscape(_ c: Character) -> Character {
        if c == "n" { return "\n" }
        if c == "t" { return "\t" }
        if c == "r" { return "\r" }
        return c
    }

    private func parseSizedString() -> LLSD {
        consume() // 's'
        if peek() == "(" {
            consume()
            let numStart = index
            while index < text.endIndex && text[index] != ")" {
                index = text.index(after: index)
            }
            let sizeStr = String(text[numStart..<index])
            let size = Int(sizeStr) ?? 0
            if index < text.endIndex { consume() } // ')'
            if index < text.endIndex && (text[index] == "\"" || text[index] == "'") { consume() }
            let end = text.index(index, offsetBy: size, limitedBy: text.endIndex) ?? text.endIndex
            let s = String(text[index..<end])
            index = end
            if index < text.endIndex && (text[index] == "\"" || text[index] == "'") { consume() }
            return .string(s)
        }
        if peek() == "\"" { return .string(parseDoubleQuoted()) }
        if peek() == "'" { return .string(parseSingleQuoted()) }
        return .string("")
    }

    private func parseBinaryNotation() -> LLSD {
        consume() // 'b'
        if peekAt(0) == "6" && peekAt(1) == "4" {
            index = text.index(index, offsetBy: 2)
            let dataStr = parseQuotedAfterTag()
            if let data = Data(base64Encoded: dataStr) {
                return .binary(data)
            }
            return .binary(Data())
        }
        if peekAt(0) == "1" && peekAt(1) == "6" {
            index = text.index(index, offsetBy: 2)
            let dataStr = parseQuotedAfterTag()
            var bytes = [UInt8]()
            var idx = dataStr.startIndex
            while idx < dataStr.endIndex {
                let nextIdx = dataStr.index(idx, offsetBy: 2, limitedBy: dataStr.endIndex) ?? dataStr.endIndex
                if let byte = UInt8(dataStr[idx..<nextIdx], radix: 16) {
                    bytes.append(byte)
                }
                idx = nextIdx
            }
            return .binary(Data(bytes))
        }
        if peekAt(0) == "(" {
            consume() // '('
            let numStart = index
            while index < text.endIndex && text[index] != ")" {
                index = text.index(after: index)
            }
            let sizeStr = String(text[numStart..<index])
            let size = Int(sizeStr) ?? 0
            if index < text.endIndex { consume() } // ')'
            if index < text.endIndex && (text[index] == "\"" || text[index] == "'") { consume() }
            let end = text.index(index, offsetBy: size, limitedBy: text.endIndex) ?? text.endIndex
            let bytes = Array(String(text[index..<end]).utf8)
            index = end
            if index < text.endIndex && (text[index] == "\"" || text[index] == "'") { consume() }
            return .binary(Data(bytes))
        }
        return .binary(Data())
    }

    private func parseMap() -> LLSD {
        consume() // '{'
        var map = [String: LLSD]()
        skipWs()
        while index < text.endIndex && peek() != "}" {
            skipWs()
            var key = ""
            if let c = peek() {
                if c == "'" { key = parseSingleQuoted() }
                else if c == "\"" { key = parseDoubleQuoted() }
                else if c == "s" { key = parseSizedString().asString() }
                else { key = parseNumberWord() }
            }

            skipWs()
            if peek() == ":" { consume() }
            skipWs()
            map[key] = parseValue()
            skipWs()
            if peek() == "," { consume() }
            skipWs()
        }
        if index < text.endIndex { consume() } // '}'
        return .map(map)
    }

    private func parseArray() -> LLSD {
        consume() // '['
        var arr = [LLSD]()
        skipWs()
        while index < text.endIndex && peek() != "]" {
            arr.append(parseValue())
            skipWs()
            if peek() == "," { consume() }
            skipWs()
        }
        if index < text.endIndex { consume() } // ']'
        return .array(arr)
    }
}
