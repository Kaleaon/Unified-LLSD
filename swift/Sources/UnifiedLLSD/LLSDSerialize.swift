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
        case .string(let s): return s.isEmpty ? "<string/>" : "<string>\(s)</string>"
        case .uuid(let u): return u.isNull ? "<uuid/>" : "<uuid>\(u.description)</uuid>"
        case .date(let d): return "<date>\(d.description)</date>"
        case .uri(let u): return "<uri>\(u.description)</uri>"
        case .binary(let b): return "<binary encoding=\"base64\">\(b.base64EncodedString())</binary>"
        case .map(let m):
            var res = "<map>"
            for (k, v) in m {
                res += "<key>\(k)</key>"
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

    public static func fromXML(_ xml: String) -> LLSD {
        if xml.contains("<integer>") {
            if let range = xml.range(of: "<integer>(.*?)</integer>", options: .regularExpression) {
                let match = String(xml[range])
                    .replacingOccurrences(of: "<integer>", with: "")
                    .replacingOccurrences(of: "</integer>", with: "")
                if let i = Int64(match) { return .integer(i) }
            }
        }
        return .undefined
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
            return "'\(escapeNotationString(s))'"
        case .uuid(let u):
            return "u\(u.description)"
        case .date(let d):
            return "d\"\(d.description)\""
        case .uri(let u):
            return "l\"\(u.description)\""
        case .binary(let b):
            return "b64\"\(b.base64EncodedString())\""
        case .map(let m):
            var res = "{"
            var first = true
            for key in m.keys.sorted() {
                if !first { res += "," }
                first = false
                res += "'\(escapeNotationString(key))':\(toNotation(m[key]!))"
            }
            res += "}"
            return res
        case .array(let a):
            var res = "["
            var first = true
            for v in a {
                if !first { res += "," }
                first = false
                res += toNotation(v)
            }
            res += "]"
            return res
        }
    }

    private static func escapeNotationString(_ s: String) -> String {
        var res = ""
        for c in s {
            if c == "'" || c == "\\" {
                res.append("\\")
            }
            res.append(c)
        }
        return res
    }

    public static func fromNotation(_ text: String) -> LLSD {
        var cleaned = text
        if cleaned.hasPrefix("<?llsd/notation?>") || cleaned.hasPrefix("<? llsd/notation ?>") {
            if let newlineIndex = cleaned.firstIndex(of: "\n") {
                cleaned = String(cleaned[cleaned.index(after: newlineIndex)...])
            }
        }
        var parser = SwiftNotationParser(text: cleaned)
        return parser.parse()
    }
}

private struct SwiftNotationParser {
    let chars: [Character]
    var pos: Int = 0

    init(text: String) {
        self.chars = Array(text)
    }

    mutating func parse() -> LLSD {
        skipWs()
        return parseValue()
    }

    mutating func skipWs() {
        while pos < chars.count && chars[pos].isWhitespace {
            pos += 1
        }
    }

    func peek() -> Character? {
        guard pos < chars.count else { return nil }
        return chars[pos]
    }

    func peekAt(_ offset: Int) -> Character? {
        guard pos + offset < chars.count else { return nil }
        return chars[pos + offset]
    }

    @discardableResult
    mutating func consume() -> Character? {
        guard pos < chars.count else { return nil }
        let c = chars[pos]
        pos += 1
        return c
    }

    mutating func parseValue() -> LLSD {
        skipWs()
        guard let c = peek() else { return .undefined }

        switch c {
        case "!":
            consume()
            return .undefined
        case "T", "t":
            return parseBoolWord(true)
        case "F", "f":
            return parseBoolWord(false)
        case "1":
            consume()
            return .boolean(true)
        case "0":
            consume()
            return .boolean(false)
        case "i":
            consume()
            let numStr = parseNumberWord()
            let val = Int64(numStr) ?? 0
            return .integer(val)
        case "r":
            consume()
            let numStr = parseNumberWord()
            if numStr == "nan" { return .real(.nan) }
            if numStr == "inf" || numStr == "+inf" || numStr == "infinity" { return .real(.infinity) }
            if numStr == "-inf" || numStr == "-infinity" { return .real(-.infinity) }
            let val = Double(numStr) ?? 0.0
            return .real(val)
        case "u":
            consume()
            let uuidStr = parseUuidLiteral()
            if let u = LLUUID(string: uuidStr) {
                return .uuid(u)
            }
            return .uuid(.null)
        case "d":
            consume()
            let qStr = parseQuotedAfterTag()
            if let d = LLDate(isoString: qStr) {
                return .date(d)
            }
            return .date(.null)
        case "l":
            consume()
            let qStr = parseQuotedAfterTag()
            return .uri(LLURI(uriString: qStr))
        case "b":
            return parseBinaryNotation()
        case "s":
            return parseSizedString()
        case "'":
            return .string(parseSingleQuoted())
        case "\"":
            return .string(parseDoubleQuoted())
        case "{":
            return parseMap()
        case "[":
            return parseArray()
        default:
            consume()
            return .undefined
        }
    }

    mutating func parseBoolWord(_ expectedBool: Bool) -> LLSD {
        let word = expectedBool ? "true" : "false"
        var matched = true
        for (i, char) in word.enumerated() {
            if let p = peekAt(i), p.lowercased() == String(char).lowercased() {
                continue
            } else {
                matched = false
                break
            }
        }
        if matched {
            pos += word.count
        } else {
            consume()
        }
        return .boolean(expectedBool)
    }

    mutating func parseNumberWord() -> String {
        let start = pos
        while pos < chars.count {
            let c = chars[pos]
            if c.isWhitespace || c == "," || c == "}" || c == "]" {
                break
            }
            pos += 1
        }
        return String(chars[start..<pos])
    }

    mutating func parseUuidLiteral() -> String {
        let start = pos
        let end = min(start + 36, chars.count)
        pos = end
        return String(chars[start..<end])
    }

    mutating func parseQuotedAfterTag() -> String {
        skipWs()
        guard let c = peek() else { return "" }
        if c == "\"" {
            return parseDoubleQuoted()
        } else if c == "'" {
            return parseSingleQuoted()
        }
        return ""
    }

    mutating func parseDoubleQuoted() -> String {
        guard peek() == "\"" else { return "" }
        consume()
        var sb = ""
        while pos < chars.count && chars[pos] != "\"" {
            if chars[pos] == "\\" && pos + 1 < chars.count {
                pos += 1
                sb.append(decodeEscape(chars[pos]))
            } else {
                sb.append(chars[pos])
            }
            pos += 1
        }
        if pos < chars.count { consume() }
        return sb
    }

    mutating func parseSingleQuoted() -> String {
        guard peek() == "'" else { return "" }
        consume()
        var sb = ""
        while pos < chars.count && chars[pos] != "'" {
            if chars[pos] == "\\" && pos + 1 < chars.count {
                pos += 1
                sb.append(decodeEscape(chars[pos]))
            } else {
                sb.append(chars[pos])
            }
            pos += 1
        }
        if pos < chars.count { consume() }
        return sb
    }

    func decodeEscape(_ c: Character) -> Character {
        switch c {
        case "n": return "\n"
        case "t": return "\t"
        case "r": return "\r"
        default: return c
        }
    }

    mutating func parseSizedString() -> LLSD {
        consume() // 's'
        if peek() == "(" {
            consume() // '('
            let start = pos
            while pos < chars.count && chars[pos] != ")" { pos += 1 }
            let sizeStr = String(chars[start..<pos])
            let size = Int(sizeStr) ?? 0
            if pos < chars.count { consume() } // ')'
            if pos < chars.count && (chars[pos] == "\"" || chars[pos] == "'") { consume() }
            let end = min(pos + size, chars.count)
            let str = String(chars[pos..<end])
            pos = end
            if pos < chars.count && (chars[pos] == "\"" || chars[pos] == "'") { consume() }
            return .string(str)
        }
        if peek() == "\"" { return .string(parseDoubleQuoted()) }
        if peek() == "'" { return .string(parseSingleQuoted()) }
        return .string("")
    }

    mutating func parseBinaryNotation() -> LLSD {
        consume() // 'b'
        if peekAt(0) == "6" && peekAt(1) == "4" {
            pos += 2
            let dataStr = parseQuotedAfterTag()
            if let data = Data(base64Encoded: dataStr) {
                return .binary(data)
            }
            return .binary(Data())
        }
        if peekAt(0) == "1" && peekAt(1) == "6" {
            pos += 2
            let hexStr = parseQuotedAfterTag()
            return .binary(hexDecode(hexStr))
        }
        if peekAt(0) == "(" {
            consume() // '('
            let start = pos
            while pos < chars.count && chars[pos] != ")" { pos += 1 }
            let sizeStr = String(chars[start..<pos])
            let size = Int(sizeStr) ?? 0
            if pos < chars.count { consume() } // ')'
            if pos < chars.count && (chars[pos] == "\"" || chars[pos] == "'") { consume() }
            let end = min(pos + size, chars.count)
            var bytes = [UInt8]()
            for i in pos..<end {
                if let ascii = chars[i].asciiValue {
                    bytes.append(ascii)
                } else {
                    bytes.append(0)
                }
            }
            pos = end
            if pos < chars.count && (chars[pos] == "\"" || chars[pos] == "'") { consume() }
            return .binary(Data(bytes))
        }
        return .binary(Data())
    }

    func hexDecode(_ hex: String) -> Data {
        let clean = hex.filter { !$0.isWhitespace }
        var data = Data()
        var index = clean.startIndex
        while index < clean.endIndex {
            let nextIndex = clean.index(index, offsetBy: 2, limitedBy: clean.endIndex) ?? clean.endIndex
            if let byte = UInt8(clean[index..<nextIndex], radix: 16) {
                data.append(byte)
            }
            index = nextIndex
        }
        return data
    }

    mutating func parseMap() -> LLSD {
        consume() // '{'
        var map = [String: LLSD]()
        skipWs()
        while pos < chars.count && peek() != "}" {
            skipWs()
            if peek() == "}" { break }
            guard let c = peek() else { break }
            var key = ""
            if c == "'" {
                key = parseSingleQuoted()
            } else if c == "\"" {
                key = parseDoubleQuoted()
            } else if c == "s" {
                key = parseSizedString().asString()
            } else {
                key = parseNumberWord()
            }
            skipWs()
            if peek() == ":" { consume() }
            skipWs()
            let val = parseValue()
            map[key] = val
            skipWs()
            if peek() == "," { consume() }
            skipWs()
        }
        if pos < chars.count && peek() == "}" { consume() }
        return .map(map)
    }

    mutating func parseArray() -> LLSD {
        consume() // '['
        var array = [LLSD]()
        skipWs()
        while pos < chars.count && peek() != "]" {
            skipWs()
            if peek() == "]" { break }
            let val = parseValue()
            array.append(val)
            skipWs()
            if peek() == "," { consume() }
            skipWs()
        }
        if pos < chars.count && peek() == "]" { consume() }
        return .array(array)
    }
}
