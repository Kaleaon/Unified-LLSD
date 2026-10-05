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
