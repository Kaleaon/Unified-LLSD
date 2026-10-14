import XCTest
@testable import UnifiedLLSD

final class LLSDTests: XCTestCase {
    func test64BitIntegerHandling() {
        let bigInt: Int64 = 9223372036854775807
        let sd = LLSD.integer(bigInt)
        XCTAssertEqual(sd.asInt64(), bigInt)
    }

    func testBinaryDateLittleEndian() {
        let sd = LLSD.date(LLDate(secondsSinceEpoch: 123456789.0))
        let bin = LLSDSerialize.toBinary(sd)
        let back = LLSDSerialize.fromBinary(bin)
        XCTAssertEqual(back.asDate().secondsSinceEpoch, 123456789.0, accuracy: 0.001)
    }

    func testNotationRoundtrip() {
        let sd = LLSD.integer(42)
        let notation = LLSDSerialize.toNotation(sd)
        XCTAssertEqual(notation, "i42")
        let back = LLSDSerialize.fromNotation(notation)
        XCTAssertEqual(back.asInt64(), 42)
    }

    func testXMLScalarAndSpecialValues() {
        // Undef
        let undefVal = LLSDSerialize.fromXML("<llsd><undef/></llsd>")
        XCTAssertTrue(undefVal.isUndefined)

        // String empty variations
        let emptyStr1 = LLSDSerialize.fromXML("<llsd><string/></llsd>")
        XCTAssertEqual(emptyStr1.asString(), "")
        let emptyStr2 = LLSDSerialize.fromXML("<llsd><string></string></llsd>")
        XCTAssertEqual(emptyStr2.asString(), "")

        // String escaping & unescaping
        let escXml = "<llsd><string>a &amp; b &lt; c &gt; &quot; d &apos; e &#39; f</string></llsd>"
        let parsedEsc = LLSDSerialize.fromXML(escXml)
        XCTAssertEqual(parsedEsc.asString(), "a & b < c > \" d ' e ' f")
        let serializedEsc = LLSDSerialize.toXML(parsedEsc)
        XCTAssertTrue(serializedEsc.contains("a &amp; b &lt; c &gt; &quot; d &apos; e &apos; f"))

        // UUID
        let uuidStr = "d7be4a36-22a7-47b1-9f22-921c17242e20"
        let uuidXml = "<llsd><uuid>\(uuidStr)</uuid></llsd>"
        let parsedUuid = LLSDSerialize.fromXML(uuidXml)
        XCTAssertEqual(parsedUuid.asUUID().description, uuidStr)

        // Date
        let dateStr = "2023-05-15T12:00:00Z"
        let dateXml = "<llsd><date>\(dateStr)</date></llsd>"
        let parsedDate = LLSDSerialize.fromXML(dateXml)
        XCTAssertEqual(parsedDate.asDate().description, dateStr)

        // Binary Base64
        let origData = "Hello World".data(using: .utf8)!
        let binXml = "<llsd><binary encoding=\"base64\">SGVsbG8gV29ybGQ=</binary></llsd>"
        let parsedBin = LLSDSerialize.fromXML(binXml)
        XCTAssertEqual(parsedBin.asString(), "SGVsbG8gV29ybGQ=")
        if case .binary(let data) = parsedBin {
            XCTAssertEqual(data, origData)
        } else {
            XCTFail("Expected binary type")
        }
    }

    func testXMLNestedContainersRoundtrip() {
        let uuid = LLUUID(string: "11111111-2222-3333-4444-555555555555")!
        let date = LLDate(isoString: "2025-01-01T00:00:00Z")!
        let binData = Data([0x01, 0x02, 0x03, 0x04])

        let mapVal: [String: LLSD] = [
            "int": .integer(100),
            "bool": .boolean(true),
            "str": .string("<test>"),
            "uuid": .uuid(uuid),
            "date": .date(date),
            "bin": .binary(binData),
            "arr": .array([.integer(1), .string("two"), .boolean(false)])
        ]
        let sd = LLSD.map(mapVal)

        let xml = LLSDSerialize.toXML(sd, withDeclaration: true)
        XCTAssertTrue(xml.hasPrefix("<?xml version=\"1.0\" ?>\n"))
        XCTAssertTrue(xml.contains("<key>int</key><integer>100</integer>"))
        XCTAssertTrue(xml.contains("<key>str</key><string>&lt;test&gt;</string>"))

        let back = LLSDSerialize.fromXML(xml)
        XCTAssertEqual(back["int"].asInt64(), 100)
        XCTAssertEqual(back["bool"].asBoolean(), true)
        XCTAssertEqual(back["str"].asString(), "<test>")
        XCTAssertEqual(back["uuid"].asUUID(), uuid)
        XCTAssertEqual(back["date"].asDate(), date)
        if case .binary(let b) = back["bin"] {
            XCTAssertEqual(b, binData)
        } else {
            XCTFail("Expected binary in deserialized map")
        }
        XCTAssertEqual(back["arr"][0].asInt64(), 1)
        XCTAssertEqual(back["arr"][1].asString(), "two")
        XCTAssertEqual(back["arr"][2].asBoolean(), false)
    }
}
