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

    func testNotationRoundtripNestedContainers() {
        let nestedMap: LLSD = .map([
            "a": .integer(100),
            "b": .string("hello world"),
            "c": .array([.integer(1), .integer(2), .boolean(true)])
        ])
        let outerMap: LLSD = .map([
            "inner": nestedMap,
            "flag": .boolean(false),
            "list": .array([.string("item1"), .map(["key": .string("value")])])
        ])

        let notation = LLSDSerialize.toNotation(outerMap)
        let parsed = LLSDSerialize.fromNotation(notation)

        XCTAssertEqual(parsed["inner"]["a"].asInt64(), 100)
        XCTAssertEqual(parsed["inner"]["b"].asString(), "hello world")
        XCTAssertEqual(parsed["inner"]["c"][0].asInt64(), 1)
        XCTAssertEqual(parsed["inner"]["c"][2].asBoolean(), true)
        XCTAssertEqual(parsed["flag"].asBoolean(), false)
        XCTAssertEqual(parsed["list"][0].asString(), "item1")
        XCTAssertEqual(parsed["list"][1]["key"].asString(), "value")
    }

    func testNotationRoundtripRealsAndEscapes() {
        let posReal = LLSD.real(3.14159)
        let posParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(posReal))
        XCTAssertEqual(posParsed.asDouble(), 3.14159, accuracy: 0.00001)

        let nanVal = LLSD.real(.nan)
        let nanParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(nanVal))
        XCTAssertTrue(nanParsed.asDouble().isNaN)

        let infVal = LLSD.real(.infinity)
        let infParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(infVal))
        XCTAssertTrue(infParsed.asDouble().isInfinite && infParsed.asDouble() > 0)

        let escapedStr = LLSD.string("Line1\nLine2\t'escaped\\quote'")
        let strNotation = LLSDSerialize.toNotation(escapedStr)
        let strParsed = LLSDSerialize.fromNotation(strNotation)
        XCTAssertEqual(strParsed.asString(), "Line1\nLine2\t'escaped\\quote'")
    }

    func testNotationTypedScalars() {
        let uuidVal = LLUUID(string: "d7b9a528-1b2c-4e3f-a5a6-7b8c9d0e1f2a")!
        let uuidSD = LLSD.uuid(uuidVal)
        let uuidParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(uuidSD))
        XCTAssertEqual(uuidParsed.asUUID(), uuidVal)

        let dateVal = LLDate(secondsSinceEpoch: 1672531199.0)
        let dateSD = LLSD.date(dateVal)
        let dateParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(dateSD))
        XCTAssertEqual(dateParsed.asDate().secondsSinceEpoch, 1672531199.0, accuracy: 0.001)

        let uriVal = LLURI(uriString: "https://secondlife.com/api/test")
        let uriSD = LLSD.uri(uriVal)
        let uriParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(uriSD))
        XCTAssertEqual(uriParsed.asURI().uriString, "https://secondlife.com/api/test")

        let binVal = Data([0x01, 0x02, 0x03, 0xFF, 0x00, 0xAB])
        let binSD = LLSD.binary(binVal)
        let binParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(binSD))
        XCTAssertEqual(binParsed.asBinary(), binVal)

        let undefParsed = LLSDSerialize.fromNotation("!")
        XCTAssertTrue(undefParsed.isUndefined)
    }
}
