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

    func testXMLSerializationScalars() {
        XCTAssertEqual(LLSDSerialize.toXML(.undefined), "<llsd><undef/></llsd>")
        XCTAssertEqual(LLSDSerialize.toXML(.boolean(true)), "<llsd><boolean>true</boolean></llsd>")
        XCTAssertEqual(LLSDSerialize.toXML(.boolean(false)), "<llsd><boolean>false</boolean></llsd>")
        XCTAssertEqual(LLSDSerialize.toXML(.integer(12345)), "<llsd><integer>12345</integer></llsd>")
        XCTAssertEqual(LLSDSerialize.toXML(.real(3.14)), "<llsd><real>3.14</real></llsd>")
        XCTAssertEqual(LLSDSerialize.toXML(.real(Double.nan)), "<llsd><real>nan</real></llsd>")
        XCTAssertEqual(LLSDSerialize.toXML(.real(Double.infinity)), "<llsd><real>inf</real></llsd>")
        XCTAssertEqual(LLSDSerialize.toXML(.real(-Double.infinity)), "<llsd><real>-inf</real></llsd>")
        XCTAssertEqual(LLSDSerialize.toXML(.string("hello")), "<llsd><string>hello</string></llsd>")
        XCTAssertEqual(LLSDSerialize.toXML(.string("")), "<llsd><string/></llsd>")
        XCTAssertEqual(LLSDSerialize.toXML(.uuid(LLUUID.null)), "<llsd><uuid/></llsd>")
        let uuidStr = "a0b1c2d3-e4f5-6789-0123-456789abcdef"
        XCTAssertEqual(LLSDSerialize.toXML(.uuid(LLUUID(string: uuidStr)!)), "<llsd><uuid>\(uuidStr)</uuid></llsd>")
        XCTAssertEqual(LLSDSerialize.toXML(.date(LLDate(secondsSinceEpoch: 0.0))), "<llsd><date>1970-01-01T00:00:00Z</date></llsd>")
        XCTAssertEqual(LLSDSerialize.toXML(.uri(LLURI(uriString: "http://example.com"))), "<llsd><uri>http://example.com</uri></llsd>")
        XCTAssertEqual(LLSDSerialize.toXML(.binary(Data([0x01, 0x02, 0x03]))), "<llsd><binary encoding=\"base64\">AQID</binary></llsd>")
    }

    func testXMLSerializationDeclaration() {
        let xml = LLSDSerialize.toXML(.boolean(true), withDeclaration: true)
        XCTAssertEqual(xml, "<?xml version=\"1.0\" ?>\n<llsd><boolean>true</boolean></llsd>")
    }

    func testXMLSerializationMapAndArray() {
        let arraySD = LLSD.array([.integer(1), .string("test")])
        XCTAssertEqual(LLSDSerialize.toXML(arraySD), "<llsd><array><integer>1</integer><string>test</string></array></llsd>")

        let mapSD = LLSD.map(["a": .integer(10)])
        XCTAssertEqual(LLSDSerialize.toXML(mapSD), "<llsd><map><key>a</key><integer>10</integer></map></llsd>")

        let nestedSD = LLSD.map(["items": .array([.integer(1), .integer(2)])])
        XCTAssertEqual(LLSDSerialize.toXML(nestedSD), "<llsd><map><key>items</key><array><integer>1</integer><integer>2</integer></array></map></llsd>")
    }

    func testXMLSerializationLargeNested() {
        var elements: [LLSD] = []
        for i in 0..<100 {
            elements.append(.map(["id": .integer(Int64(i)), "val": .string("item_\(i)")]))
        }
        let payload = LLSD.map(["count": .integer(100), "data": .array(elements)])
        let xml = LLSDSerialize.toXML(payload)
        XCTAssertTrue(xml.hasPrefix("<llsd><map>"))
        XCTAssertTrue(xml.hasSuffix("</map></llsd>"))
        XCTAssertTrue(xml.contains("<key>count</key><integer>100</integer>"))
        XCTAssertTrue(xml.contains("<key>id</key><integer>0</integer>"))
        XCTAssertTrue(xml.contains("<key>val</key><string>item_99</string>"))
    }
}
