import Foundation

public struct LLSDSerialize {
    public static let binaryHeader = "<? llsd/binary ?>\n"
    public static let notationHeader = "<? llsd/notation ?>\n"
    public static let xmlHeader = "<?xml version=\"1.0\" ?>\n"

    // --- XML ---
    public static func toXML(_ sd: LLSD, withDeclaration: Bool = false) -> String {
        var xml = ""
        xml.reserveCapacity(256)
        if withDeclaration {
            xml.append(xmlHeader)
        }
        xml.append("<llsd>")
        writeXmlElement(sd, into: &xml)
        xml.append("</llsd>")
        return xml
    }

    private static func writeXmlElement(_ sd: LLSD, into xml: inout String) {
        switch sd {
        case .undefined:
            xml.append("<undef/>")
        case .boolean(let b):
            xml.append("<boolean>")
            xml.append(b ? "true" : "false")
            xml.append("</boolean>")
        case .integer(let i):
            xml.append("<integer>")
            xml.append(String(i))
            xml.append("</integer>")
        case .real(let r):
            xml.append("<real>")
            if r.isNaN {
                xml.append("nan")
            } else if r.isInfinite {
                xml.append(r > 0 ? "inf" : "-inf")
            } else {
                xml.append(String(r))
            }
            xml.append("</real>")
        case .string(let s):
            if s.isEmpty {
                xml.append("<string/>")
            } else {
                xml.append("<string>")
                xml.append(s)
                xml.append("</string>")
            }
        case .uuid(let u):
            if u.isNull {
                xml.append("<uuid/>")
            } else {
                xml.append("<uuid>")
                xml.append(u.description)
                xml.append("</uuid>")
            }
        case .date(let d):
            xml.append("<date>")
            xml.append(d.description)
            xml.append("</date>")
        case .uri(let u):
            xml.append("<uri>")
            xml.append(u.description)
            xml.append("</uri>")
        case .binary(let b):
            xml.append("<binary encoding=\"base64\">")
            xml.append(b.base64EncodedString())
            xml.append("</binary>")
        case .map(let m):
            xml.append("<map>")
            for (k, v) in m {
                xml.append("<key>")
                xml.append(k)
                xml.append("</key>")
                writeXmlElement(v, into: &xml)
            }
            xml.append("</map>")
        case .array(let a):
            xml.append("<array>")
            for v in a {
                writeXmlElement(v, into: &xml)
            }
            xml.append("</array>")
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
