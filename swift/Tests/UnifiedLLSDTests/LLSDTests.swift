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

    func testDateParsingFractionalAndStandard() {
        // Fractional ISO-8601 date
        let fractionalStr = "2023-05-18T12:34:56.789Z"
        guard let fractionalDate = LLDate(isoString: fractionalStr) else {
            XCTFail("Failed to parse fractional ISO8601 date string")
            return
        }
        XCTAssertEqual(fractionalDate.secondsSinceEpoch, 1684413296.789, accuracy: 0.001)

        // Standard ISO-8601 date
        let standardStr = "2023-05-18T12:34:56Z"
        guard let standardDate = LLDate(isoString: standardStr) else {
            XCTFail("Failed to parse standard ISO8601 date string")
            return
        }
        XCTAssertEqual(standardDate.secondsSinceEpoch, 1684413296.0, accuracy: 0.001)

        // Invalid date string
        let invalidDate = LLDate(isoString: "not-a-valid-date-string")
        XCTAssertNil(invalidDate)
    }

    func testDateDescriptionFormatting() {
        let date = LLDate(secondsSinceEpoch: 1684413296.0)
        XCTAssertEqual(date.description, "2023-05-18T12:34:56Z")
    }

    func testDateSerializationXMLRoundtrip() {
        let originalDate = LLDate(secondsSinceEpoch: 1684413296.0)
        let sd = LLSD.date(originalDate)
        let xml = LLSDSerialize.toXML(sd)
        XCTAssertEqual(xml, "<llsd><date>2023-05-18T12:34:56Z</date></llsd>")

        let fractionalParsed = LLSD.string("2023-05-18T12:34:56.789Z").asDate()
        XCTAssertEqual(fractionalParsed.secondsSinceEpoch, 1684413296.789, accuracy: 0.001)
    }
}
