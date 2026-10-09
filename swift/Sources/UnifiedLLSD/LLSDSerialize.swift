import Foundation

public struct LLSDSerialize {
    public static let binaryHeader = "<? llsd/binary ?>\n"
    public static let notationHeader = "<? llsd/notation ?>\n"
    public static let xmlHeader = "<?xml version=\"1.0\" ?>\n"

    public enum Format {
        case xml
        case binary
        case notation
    }

    // --- Auto-Detection & General Parse ---
    public static func parse(_ data: Data) -> LLSD {
        guard !data.isEmpty else { return .undefined }
        let format = detectFormat(data)
        switch format {
        case .binary:
            return fromBinary(data)
        case .notation:
            if let str = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) {
                return fromNotation(str)
            }
            return .undefined
        case .xml:
            if let str = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) {
                return fromXML(str)
            }
            return .undefined
        }
    }

    public static func parse(_ string: String) -> LLSD {
        let clean = string.trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.hasPrefix("<? llsd/binary ?>") || clean.hasPrefix("<?llsd/binary?>") {
            if let data = string.data(using: .utf8) ?? string.data(using: .isoLatin1) {
                return fromBinary(data)
            }
        }
        if clean.hasPrefix("<? llsd/notation ?>") || clean.hasPrefix("<?llsd/notation?>") {
            return fromNotation(string)
        }
        return fromXML(string)
    }

    public static func detectFormat(_ data: Data) -> Format {
        if data.count >= 2 && data[0] == 0x3c && data[1] == 0x3f { // "<?"
            let prefixStr = String(data: data.prefix(64), encoding: .isoLatin1) ?? ""
            if prefixStr.contains("llsd/binary") { return .binary }
            if prefixStr.contains("llsd/notation") { return .notation }
            if prefixStr.contains("xml") { return .xml }
        }
        if data.count >= 1 {
            let tag = data[0]
            if tag == 0x3c { return .xml } // '<'
            if tag == 0x21 || tag == 0x31 || tag == 0x30 || tag == 0x69 || tag == 0x72 ||
               tag == 0x73 || tag == 0x53 || tag == 0x75 || tag == 0x64 || tag == 0x6c ||
               tag == 0x62 || tag == 0x7b || tag == 0x5b {
                return .binary
            }
        }
        return .xml
    }

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
        case .uri(let u): return u.uriString.isEmpty ? "<uri/>" : "<uri>\(xmlEscape(u.description))</uri>"
        case .binary(let b): return b.isEmpty ? "<binary encoding=\"base64\"/>" : "<binary encoding=\"base64\">\(b.base64EncodedString())</binary>"
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

    public static func xmlEscape(_ s: String) -> String {
        return s.replacingOccurrences(of: "&", with: "&amp;")
                .replacingOccurrences(of: "<", with: "&lt;")
                .replacingOccurrences(of: ">", with: "&gt;")
                .replacingOccurrences(of: "\"", with: "&quot;")
                .replacingOccurrences(of: "'", with: "&apos;")
    }

    public static func xmlUnescape(_ s: String) -> String {
        return s.replacingOccurrences(of: "&lt;", with: "<")
                .replacingOccurrences(of: "&gt;", with: ">")
                .replacingOccurrences(of: "&quot;", with: "\"")
                .replacingOccurrences(of: "&apos;", with: "'")
                .replacingOccurrences(of: "&#39;", with: "'")
                .replacingOccurrences(of: "&amp;", with: "&")
    }

    public static func fromXML(_ xml: String) -> LLSD {
        let clean = xml.trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.isEmpty { return .undefined }
        var pos = clean.startIndex
        return parseXmlTree(clean, pos: &pos)
    }

    private static func parseXmlTree(_ xml: String, pos: inout String.Index) -> LLSD {
        skipXmlMisc(xml, pos: &pos)
        guard pos < xml.endIndex else { return .undefined }

        guard xml[pos] == "<" else { return .undefined }
        let tagStart = xml.index(after: pos)
        guard let tagEnd = xml[tagStart...].firstIndex(of: ">") else { return .undefined }

        let tagHeader = String(xml[tagStart..<tagEnd]).trimmingCharacters(in: .whitespaces)
        let selfClosing = tagHeader.hasSuffix("/")
        let cleanHeader = selfClosing ? String(tagHeader.dropLast()).trimmingCharacters(in: .whitespaces) : tagHeader

        let components = cleanHeader.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
        let tagName = components.first ?? ""

        pos = xml.index(after: tagEnd)

        if tagName == "llsd" {
            return parseXmlTree(xml, pos: &pos)
        }
        if tagName == "undef" {
            return .undefined
        }

        var content = ""
        if !selfClosing {
            let closeTag = "</\(tagName)>"
            if let closeRange = xml[pos...].range(of: closeTag) {
                content = String(xml[pos..<closeRange.lowerBound])
                pos = closeRange.upperBound
            } else {
                content = String(xml[pos...])
                pos = xml.endIndex
            }
        }

        switch tagName {
        case "boolean":
            let t = content.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return .boolean(t == "true" || t == "1" || t == "t")
        case "integer":
            let t = content.trimmingCharacters(in: .whitespacesAndNewlines)
            return .integer(Int64(t) ?? 0)
        case "real":
            let t = content.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if t == "nan" { return .real(.nan) }
            if t == "inf" || t == "+inf" { return .real(.infinity) }
            if t == "-inf" { return .real(-.infinity) }
            return .real(Double(t) ?? 0.0)
        case "string":
            return .string(xmlUnescape(content))
        case "uuid":
            let t = content.trimmingCharacters(in: .whitespacesAndNewlines)
            if t.isEmpty { return .uuid(LLUUID.null) }
            return .uuid(LLUUID(string: t) ?? LLUUID.null)
        case "date":
            let t = content.trimmingCharacters(in: .whitespacesAndNewlines)
            if t.isEmpty { return .date(LLDate.null) }
            return .date(LLDate(isoString: t) ?? LLDate.null)
        case "uri":
            return .uri(LLURI(uriString: xmlUnescape(content.trimmingCharacters(in: .whitespacesAndNewlines))))
        case "binary":
            let t = content.trimmingCharacters(in: .whitespacesAndNewlines)
            if t.isEmpty { return .binary(Data()) }
            if let data = Data(base64Encoded: t, options: [.ignoreUnknownCharacters]) {
                return .binary(data)
            }
            return .binary(Data())
        case "map":
            var mapDict = [String: LLSD]()
            var innerPos = content.startIndex
            while innerPos < content.endIndex {
                skipXmlMisc(content, pos: &innerPos)
                if innerPos >= content.endIndex { break }
                if let keyOpen = content[innerPos...].range(of: "<key>") {
                    innerPos = keyOpen.upperBound
                    if let keyClose = content[innerPos...].range(of: "</key>") {
                        let rawKey = String(content[innerPos..<keyClose.lowerBound])
                        let key = xmlUnescape(rawKey)
                        innerPos = keyClose.upperBound
                        let val = parseXmlTree(content, pos: &innerPos)
                        mapDict[key] = val
                    } else { break }
                } else { break }
            }
            return .map(mapDict)
        case "array":
            var arr = [LLSD]()
            var innerPos = content.startIndex
            while innerPos < content.endIndex {
                skipXmlMisc(content, pos: &innerPos)
                if innerPos >= content.endIndex { break }
                if content[innerPos] == "<" {
                    arr.append(parseXmlTree(content, pos: &innerPos))
                } else {
                    innerPos = content.index(after: innerPos)
                }
            }
            return .array(arr)
        default:
            return .undefined
        }
    }

    private static func skipXmlMisc(_ xml: String, pos: inout String.Index) {
        while pos < xml.endIndex {
            if xml[pos].isWhitespace {
                pos = xml.index(after: pos)
                continue
            }
            if xml[pos...].hasPrefix("<?") {
                if let end = xml[pos...].range(of: "?>") {
                    pos = end.upperBound
                    continue
                }
            }
            if xml[pos...].hasPrefix("<!--") {
                if let end = xml[pos...].range(of: "-->") {
                    pos = end.upperBound
                    continue
                }
            }
            break
        }
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
            var beLen = Int32(utf8.count).bigEndian
            withUnsafeBytes(of: &beLen) { data.append(contentsOf: $0) }
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
            var beLen = Int32(utf8.count).bigEndian
            withUnsafeBytes(of: &beLen) { data.append(contentsOf: $0) }
            data.append(utf8)
        case .binary(let b):
            data.append(98) // 'b'
            var beLen = Int32(b.count).bigEndian
            withUnsafeBytes(of: &beLen) { data.append(contentsOf: $0) }
            data.append(b)
        case .map(let m):
            data.append(123) // '{'
            var beCount = Int32(m.count).bigEndian
            withUnsafeBytes(of: &beCount) { data.append(contentsOf: $0) }
            for (k, v) in m {
                let kUtf8 = Data(k.utf8)
                data.append(107) // 'k'
                var beKLen = Int32(kUtf8.count).bigEndian
                withUnsafeBytes(of: &beKLen) { data.append(contentsOf: $0) }
                data.append(kUtf8)
                writeBinary(&data, v)
            }
            data.append(125) // '}'
        case .array(let a):
            data.append(91) // '['
            var beCount = Int32(a.count).bigEndian
            withUnsafeBytes(of: &beCount) { data.append(contentsOf: $0) }
            for v in a {
                writeBinary(&data, v)
            }
            data.append(93) // ']'
        }
    }

    public static func fromBinary(_ data: Data) -> LLSD {
        guard !data.isEmpty else { return .undefined }
        var offset = 0
        if data.count >= 2 && data[0] == 0x3c && data[1] == 0x3f { // "<? llsd/binary ?>\n"
            if let newlineIndex = data.firstIndex(of: 0x0a) {
                offset = newlineIndex + 1
            }
        }
        return readBinary(data, offset: &offset)
    }

    private static func readBinary(_ data: Data, offset: inout Int) -> LLSD {
        guard offset < data.count else { return .undefined }
        let tag = data[offset]
        offset += 1

        switch tag {
        case 33: // '!'
            return .undefined
        case 49: // '1'
            return .boolean(true)
        case 48: // '0'
            return .boolean(false)
        case 105: // 'i'
            guard offset + 4 <= data.count else { return .undefined }
            let val = data.subdata(in: offset..<offset+4).withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian
            offset += 4
            return .integer(Int64(val))
        case 114: // 'r'
            guard offset + 8 <= data.count else { return .undefined }
            let beBits = data.subdata(in: offset..<offset+8).withUnsafeBytes { $0.load(as: UInt64.self) }.bigEndian
            offset += 8
            return .real(Double(bitPattern: beBits))
        case 115: // 's'
            guard offset + 4 <= data.count else { return .undefined }
            let len = Int(data.subdata(in: offset..<offset+4).withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian)
            offset += 4
            guard len >= 0, offset + len <= data.count else { return .undefined }
            let strData = data.subdata(in: offset..<offset+len)
            offset += len
            let str = String(data: strData, encoding: .utf8) ?? ""
            return .string(str)
        case 83: // 'S' (Short string)
            guard offset + 1 <= data.count else { return .undefined }
            let len = Int(data[offset])
            offset += 1
            guard len >= 0, offset + len <= data.count else { return .undefined }
            let strData = data.subdata(in: offset..<offset+len)
            offset += len
            let str = String(data: strData, encoding: .utf8) ?? ""
            return .string(str)
        case 117: // 'u'
            guard offset + 16 <= data.count else { return .undefined }
            let bytes = Array(data.subdata(in: offset..<offset+16))
            offset += 16
            return .uuid(LLUUID(bytes: bytes))
        case 100: // 'd'
            guard offset + 8 <= data.count else { return .undefined }
            let leBits = data.subdata(in: offset..<offset+8).withUnsafeBytes { $0.load(as: UInt64.self) }.littleEndian
            offset += 8
            return .date(LLDate(secondsSinceEpoch: Double(bitPattern: leBits)))
        case 108: // 'l'
            guard offset + 4 <= data.count else { return .undefined }
            let len = Int(data.subdata(in: offset..<offset+4).withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian)
            offset += 4
            guard len >= 0, offset + len <= data.count else { return .undefined }
            let strData = data.subdata(in: offset..<offset+len)
            offset += len
            let str = String(data: strData, encoding: .utf8) ?? ""
            return .uri(LLURI(uriString: str))
        case 98: // 'b'
            guard offset + 4 <= data.count else { return .undefined }
            let len = Int(data.subdata(in: offset..<offset+4).withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian)
            offset += 4
            guard len >= 0, offset + len <= data.count else { return .undefined }
            let binData = data.subdata(in: offset..<offset+len)
            offset += len
            return .binary(binData)
        case 123: // '{'
            guard offset + 4 <= data.count else { return .undefined }
            let count = Int(data.subdata(in: offset..<offset+4).withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian)
            offset += 4
            var mapDict = [String: LLSD]()
            for _ in 0..<count {
                guard offset < data.count else { break }
                let keyTag = data[offset]
                offset += 1
                var key = ""
                if keyTag == 107 || keyTag == 115 { // 'k' or 's'
                    guard offset + 4 <= data.count else { break }
                    let klen = Int(data.subdata(in: offset..<offset+4).withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian)
                    offset += 4
                    guard klen >= 0, offset + klen <= data.count else { break }
                    let kData = data.subdata(in: offset..<offset+klen)
                    offset += klen
                    key = String(data: kData, encoding: .utf8) ?? ""
                } else if keyTag == 83 { // 'S'
                    guard offset + 1 <= data.count else { break }
                    let klen = Int(data[offset])
                    offset += 1
                    guard klen >= 0, offset + klen <= data.count else { break }
                    let kData = data.subdata(in: offset..<offset+klen)
                    offset += klen
                    key = String(data: kData, encoding: .utf8) ?? ""
                } else {
                    break
                }
                let val = readBinary(data, offset: &offset)
                mapDict[key] = val
            }
            if offset < data.count && data[offset] == 125 { // '}'
                offset += 1
            }
            return .map(mapDict)
        case 91: // '['
            guard offset + 4 <= data.count else { return .undefined }
            let count = Int(data.subdata(in: offset..<offset+4).withUnsafeBytes { $0.load(as: Int32.self) }.bigEndian)
            offset += 4
            var arr = [LLSD]()
            for _ in 0..<count {
                arr.append(readBinary(data, offset: &offset))
            }
            if offset < data.count && data[offset] == 93 { // ']'
                offset += 1
            }
            return .array(arr)
        default:
            return .undefined
        }
    }

    // --- Notation ---
    public static func toNotation(_ sd: LLSD) -> String {
        switch sd {
        case .undefined: return "!"
        case .boolean(let b): return b ? "true" : "false"
        case .integer(let i): return "i\(i)"
        case .real(let r):
            if r.isNaN { return "rnan" }
            if r.isInfinite { return r > 0 ? "rinf" : "r-inf" }
            return "r\(r)"
        case .string(let s):
            var res = "'"
            for c in s {
                if c == "'" || c == "\\" { res.append("\\") }
                res.append(c)
            }
            res.append("'")
            return res
        case .uuid(let u): return "u\(u.description)"
        case .date(let d): return "d\"\(d.description)\""
        case .uri(let u): return "l\"\(u.description)\""
        case .binary(let b): return "b64\"\(b.base64EncodedString())\""
        case .map(let m):
            var res = "{"
            var first = true
            for (k, v) in m {
                if !first { res += "," }
                first = false
                res += "'"
                for c in k {
                    if c == "'" || c == "\\" { res.append("\\") }
                    res.append(c)
                }
                res += "':"
                res += toNotation(v)
            }
            res += "}"
            return res
        case .array(let a):
            var res = "["
            for (idx, v) in a.enumerated() {
                if idx > 0 { res += "," }
                res += toNotation(v)
            }
            res += "]"
            return res
        }
    }

    public static func fromNotation(_ text: String) -> LLSD {
        var clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.hasPrefix("<? llsd/notation ?>") || clean.hasPrefix("<?llsd/notation?>") {
            if let newlineIndex = clean.firstIndex(of: "\n") {
                clean = String(clean[clean.index(after: newlineIndex)...])
            }
        }
        var pos = clean.startIndex
        return NotationParser(text: clean).parseValue(pos: &pos)
    }

    private class NotationParser {
        let text: String

        init(text: String) {
            self.text = text
        }

        func parseValue(pos: inout String.Index) -> LLSD {
            skipWs(pos: &pos)
            guard pos < text.endIndex else { return .undefined }

            let c = text[pos]
            switch c {
            case "!":
                pos = text.index(after: pos)
                return .undefined
            case "1":
                pos = text.index(after: pos)
                return .boolean(true)
            case "0":
                pos = text.index(after: pos)
                return .boolean(false)
            case "t", "T":
                return parseBoolWord(pos: &pos, word: "true", value: true)
            case "f", "F":
                return parseBoolWord(pos: &pos, word: "false", value: false)
            case "i":
                pos = text.index(after: pos)
                let word = parseNumberWord(pos: &pos)
                return .integer(Int64(word) ?? 0)
            case "r":
                pos = text.index(after: pos)
                let word = parseNumberWord(pos: &pos).lowercased()
                if word == "nan" { return .real(.nan) }
                if word == "inf" || word == "+inf" { return .real(.infinity) }
                if word == "-inf" { return .real(-.infinity) }
                return .real(Double(word) ?? 0.0)
            case "'", "\"":
                return .string(parseQuoted(pos: &pos))
            case "s":
                pos = text.index(after: pos)
                if pos < text.endIndex && text[pos] == "(" {
                    pos = text.index(after: pos)
                    let numStart = pos
                    while pos < text.endIndex && text[pos] != ")" { pos = text.index(after: pos) }
                    let size = Int(text[numStart..<pos]) ?? 0
                    if pos < text.endIndex { pos = text.index(after: pos) } // ')'
                    if pos < text.endIndex && (text[pos] == "\"" || text[pos] == "'") { pos = text.index(after: pos) }
                    let endPos = text.index(pos, offsetBy: size, limitedBy: text.endIndex) ?? text.endIndex
                    let str = String(text[pos..<endPos])
                    pos = endPos
                    if pos < text.endIndex && (text[pos] == "\"" || text[pos] == "'") { pos = text.index(after: pos) }
                    return .string(str)
                }
                if pos < text.endIndex && (text[pos] == "\"" || text[pos] == "'") {
                    return .string(parseQuoted(pos: &pos))
                }
                return .string("")
            case "u":
                pos = text.index(after: pos)
                let endPos = text.index(pos, offsetBy: 36, limitedBy: text.endIndex) ?? text.endIndex
                let uStr = String(text[pos..<endPos])
                pos = endPos
                return .uuid(LLUUID(string: uStr) ?? LLUUID.null)
            case "d":
                pos = text.index(after: pos)
                let iso = parseQuotedAfterTag(pos: &pos)
                return .date(LLDate(isoString: iso) ?? LLDate.null)
            case "l":
                pos = text.index(after: pos)
                let uri = parseQuotedAfterTag(pos: &pos)
                return .uri(LLURI(uriString: uri))
            case "b":
                return parseBinaryNotation(pos: &pos)
            case "{":
                return parseMap(pos: &pos)
            case "[":
                return parseArray(pos: &pos)
            default:
                pos = text.index(after: pos)
                return .undefined
            }
        }

        private func skipWs(pos: inout String.Index) {
            while pos < text.endIndex && text[pos].isWhitespace {
                pos = text.index(after: pos)
            }
        }

        private func parseBoolWord(pos: inout String.Index, word: String, value: Bool) -> LLSD {
            let endWord = text.index(pos, offsetBy: word.count, limitedBy: text.endIndex) ?? text.endIndex
            let sub = String(text[pos..<endWord]).lowercased()
            if sub == word {
                pos = endWord
            } else {
                pos = text.index(after: pos)
            }
            return .boolean(value)
        }

        private func parseNumberWord(pos: inout String.Index) -> String {
            let start = pos
            while pos < text.endIndex {
                let c = text[pos]
                if c.isWhitespace || c == "," || c == "}" || c == "]" || c == ":" { break }
                pos = text.index(after: pos)
            }
            return String(text[start..<pos])
        }

        private func parseQuotedAfterTag(pos: inout String.Index) -> String {
            skipWs(pos: &pos)
            guard pos < text.endIndex else { return "" }
            if text[pos] == "\"" || text[pos] == "'" {
                return parseQuoted(pos: &pos)
            }
            return ""
        }

        private func parseQuoted(pos: inout String.Index) -> String {
            guard pos < text.endIndex else { return "" }
            let quoteChar = text[pos]
            pos = text.index(after: pos)
            var res = ""
            while pos < text.endIndex && text[pos] != quoteChar {
                if text[pos] == "\\" {
                    pos = text.index(after: pos)
                    if pos < text.endIndex {
                        let esc = text[pos]
                        switch esc {
                        case "n": res.append("\n")
                        case "r": res.append("\r")
                        case "t": res.append("\t")
                        default: res.append(esc)
                        }
                    }
                } else {
                    res.append(text[pos])
                }
                pos = text.index(after: pos)
            }
            if pos < text.endIndex { pos = text.index(after: pos) }
            return res
        }

        private func parseBinaryNotation(pos: inout String.Index) -> LLSD {
            pos = text.index(after: pos) // 'b'
            let sub = String(text[pos...])
            if sub.hasPrefix("64") {
                pos = text.index(pos, offsetBy: 2)
                let b64 = parseQuotedAfterTag(pos: &pos)
                if let data = Data(base64Encoded: b64, options: [.ignoreUnknownCharacters]) {
                    return .binary(data)
                }
                return .binary(Data())
            } else if sub.hasPrefix("16") {
                pos = text.index(pos, offsetBy: 2)
                let hex = parseQuotedAfterTag(pos: &pos)
                var data = Data()
                var idx = hex.startIndex
                while idx < hex.endIndex {
                    let nextIdx = hex.index(idx, offsetBy: 2, limitedBy: hex.endIndex) ?? hex.endIndex
                    if let byte = UInt8(hex[idx..<nextIdx], radix: 16) {
                        data.append(byte)
                    }
                    idx = nextIdx
                }
                return .binary(data)
            }
            return .binary(Data())
        }

        private func parseMap(pos: inout String.Index) -> LLSD {
            pos = text.index(after: pos) // '{'
            var mapDict = [String: LLSD]()
            skipWs(pos: &pos)
            while pos < text.endIndex && text[pos] != "}" {
                skipWs(pos: &pos)
                guard pos < text.endIndex && text[pos] != "}" else { break }
                let key: String
                if text[pos] == "'" || text[pos] == "\"" {
                    key = parseQuoted(pos: &pos)
                } else {
                    key = parseNumberWord(pos: &pos)
                }
                skipWs(pos: &pos)
                if pos < text.endIndex && text[pos] == ":" { pos = text.index(after: pos) }
                skipWs(pos: &pos)
                let val = parseValue(pos: &pos)
                mapDict[key] = val
                skipWs(pos: &pos)
                if pos < text.endIndex && text[pos] == "," { pos = text.index(after: pos) }
                skipWs(pos: &pos)
            }
            if pos < text.endIndex { pos = text.index(after: pos) } // '}'
            return .map(mapDict)
        }

        private func parseArray(pos: inout String.Index) -> LLSD {
            pos = text.index(after: pos) // '['
            var arr = [LLSD]()
            skipWs(pos: &pos)
            while pos < text.endIndex && text[pos] != "]" {
                arr.append(parseValue(pos: &pos))
                skipWs(pos: &pos)
                if pos < text.endIndex && text[pos] == "," { pos = text.index(after: pos) }
                skipWs(pos: &pos)
            }
            if pos < text.endIndex { pos = text.index(after: pos) } // ']'
            return .array(arr)
        }
    }
}
