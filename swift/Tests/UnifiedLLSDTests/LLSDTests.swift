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

    func testAllElevenTypesXmlRoundtrip() {
        let uuidVal = LLUUID(string: "d7a9aed0-8352-4467-b76f-0e1d03f0d01d")!
        let dateVal = LLDate(secondsSinceEpoch: 1700000000.0)
        let uriVal = LLURI(uriString: "https://secondlife.com/api")
        let binData = Data([0x01, 0x02, 0x03, 0xFF])

        let complexMap: LLSD = .map([
            "undef": .undefined,
            "bool_t": .boolean(true),
            "bool_f": .boolean(false),
            "int": .integer(-123456789),
            "real": .real(3.14159),
            "string": .string("Hello <World> & \"Friends\""),
            "uuid": .uuid(uuidVal),
            "date": .date(dateVal),
            "uri": .uri(uriVal),
            "binary": .binary(binData),
            "array": .array([.integer(1), .string("two"), .boolean(true)])
        ])

        let xml = LLSDSerialize.toXML(complexMap)
        let parsed = LLSDSerialize.fromXML(xml)

        XCTAssertTrue(parsed["undef"].isUndefined)
        XCTAssertEqual(parsed["bool_t"].asBoolean(), true)
        XCTAssertEqual(parsed["bool_f"].asBoolean(), false)
        XCTAssertEqual(parsed["int"].asInt64(), -123456789)
        XCTAssertEqual(parsed["real"].asDouble(), 3.14159, accuracy: 0.0001)
        XCTAssertEqual(parsed["string"].asString(), "Hello <World> & \"Friends\"")
        XCTAssertEqual(parsed["uuid"].asUUID(), uuidVal)
        XCTAssertEqual(parsed["date"].asDate().secondsSinceEpoch, 1700000000.0, accuracy: 1.0)
        XCTAssertEqual(parsed["uri"].asURI().uriString, "https://secondlife.com/api")
        XCTAssertEqual(parsed["binary"].asBinary(), binData)
        XCTAssertEqual(parsed["array"][0].asInt64(), 1)
        XCTAssertEqual(parsed["array"][1].asString(), "two")
        XCTAssertEqual(parsed["array"][2].asBoolean(), true)
    }

    func testAllElevenTypesBinaryRoundtrip() {
        let uuidVal = LLUUID(string: "a1b2c3d4-e5f6-7890-1234-56789abcdef0")!
        let dateVal = LLDate(secondsSinceEpoch: 1600000000.0)
        let uriVal = LLURI(uriString: "http://example.com/test")
        let binData = Data([0xDE, 0xAD, 0xBE, 0xEF])

        let complexMap: LLSD = .map([
            "undef": .undefined,
            "bool": .boolean(true),
            "int": .integer(987654321),
            "real": .real(-42.5),
            "string": .string("Short string and long string test"),
            "uuid": .uuid(uuidVal),
            "date": .date(dateVal),
            "uri": .uri(uriVal),
            "binary": .binary(binData),
            "nested": .array([.map(["inner": .integer(100)])])
        ])

        let bin = LLSDSerialize.toBinary(complexMap)
        let parsed = LLSDSerialize.fromBinary(bin)

        XCTAssertTrue(parsed["undef"].isUndefined)
        XCTAssertEqual(parsed["bool"].asBoolean(), true)
        XCTAssertEqual(parsed["int"].asInt64(), 987654321)
        XCTAssertEqual(parsed["real"].asDouble(), -42.5)
        XCTAssertEqual(parsed["string"].asString(), "Short string and long string test")
        XCTAssertEqual(parsed["uuid"].asUUID(), uuidVal)
        XCTAssertEqual(parsed["date"].asDate().secondsSinceEpoch, 1600000000.0, accuracy: 0.001)
        XCTAssertEqual(parsed["uri"].asURI().uriString, "http://example.com/test")
        XCTAssertEqual(parsed["binary"].asBinary(), binData)
        XCTAssertEqual(parsed["nested"][0]["inner"].asInt64(), 100)
    }

    func testBinaryShortStringParsing() {
        // Tag 'S' (83) + 1-byte length 5 + "hello"
        var data = Data([83, 5])
        data.append(contentsOf: "hello".utf8)
        let parsed = LLSDSerialize.fromBinary(data)
        XCTAssertEqual(parsed.asString(), "hello")
    }

    func testXmlEmptyTagVariants() {
        let xml = "<llsd><map><key>u</key><undef/><key>s</key><string/><key>uuid</key><uuid/><key>m</key><map/><key>a</key><array/></map></llsd>"
        let parsed = LLSDSerialize.fromXML(xml)

        XCTAssertTrue(parsed["u"].isUndefined)
        XCTAssertEqual(parsed["s"].asString(), "")
        XCTAssertEqual(parsed["uuid"].asUUID(), LLUUID.null)
        XCTAssertEqual(parsed["m"].asString(), "")
        XCTAssertEqual(parsed["a"].asString(), "")
    }

    func testNotationComplexRoundtrip() {
        let uuidVal = LLUUID(string: "00000000-0000-0000-0000-000000000001")!
        let map: LLSD = .map([
            "a": .integer(1),
            "b": .string("hello 'world'"),
            "c": .uuid(uuidVal),
            "d": .array([.boolean(true), .boolean(false)])
        ])

        let notation = LLSDSerialize.toNotation(map)
        let parsed = LLSDSerialize.fromNotation(notation)

        XCTAssertEqual(parsed["a"].asInt64(), 1)
        XCTAssertEqual(parsed["b"].asString(), "hello 'world'")
        XCTAssertEqual(parsed["c"].asUUID(), uuidVal)
        XCTAssertEqual(parsed["d"][0].asBoolean(), true)
        XCTAssertEqual(parsed["d"][1].asBoolean(), false)
    }

    func testAutoDetectParse() {
        let sd: LLSD = .map(["test": .integer(123)])

        let xml = LLSDSerialize.toXML(sd, withDeclaration: true)
        let parsedXml = LLSDSerialize.parse(xml)
        XCTAssertEqual(parsedXml["test"].asInt64(), 123)

        let bin = LLSDSerialize.binaryHeader.data(using: .utf8)! + LLSDSerialize.toBinary(sd)
        let parsedBin = LLSDSerialize.parse(bin)
        XCTAssertEqual(parsedBin["test"].asInt64(), 123)

        let notation = LLSDSerialize.notationHeader + LLSDSerialize.toNotation(sd)
        let parsedNotation = LLSDSerialize.parse(notation)
        XCTAssertEqual(parsedNotation["test"].asInt64(), 123)
    }
}
