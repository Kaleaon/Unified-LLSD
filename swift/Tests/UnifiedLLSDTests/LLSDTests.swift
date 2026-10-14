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

    func testCanonicalHyphenatedUUIDParsing() {
        let str = "6c188b48-d30e-4340-b302-397e3f84824e"
        guard let uuid = LLUUID(string: str) else {
            XCTFail("Failed to parse canonical UUID string")
            return
        }
        XCTAssertEqual(uuid.description, str)
        let expectedBytes: [UInt8] = [
            0x6c, 0x18, 0x8b, 0x48, 0xd3, 0x0e, 0x43, 0x40,
            0xb3, 0x02, 0x39, 0x7e, 0x3f, 0x84, 0x82, 0x4e
        ]
        XCTAssertEqual(uuid.bytes, expectedBytes)

        let sd = LLSD.string(str)
        XCTAssertEqual(sd.asUUID(), uuid)
    }

    func testBracedUUIDParsing() {
        let braced = "{6c188b48-d30e-4340-b302-397e3f84824e}"
        let canonical = "6c188b48-d30e-4340-b302-397e3f84824e"
        guard let uuid = LLUUID(string: braced) else {
            XCTFail("Failed to parse braced UUID string")
            return
        }
        XCTAssertEqual(uuid.description, canonical)

        let sd = LLSD.string(braced)
        XCTAssertEqual(sd.asUUID(), uuid)
    }

    func testUnhyphenatedUUIDParsing() {
        let unhyphenated = "6c188b48d30e4340b302397e3f84824e"
        let canonical = "6c188b48-d30e-4340-b302-397e3f84824e"
        guard let uuid = LLUUID(string: unhyphenated) else {
            XCTFail("Failed to parse unhyphenated UUID string")
            return
        }
        XCTAssertEqual(uuid.description, canonical)

        let sd = LLSD.string(unhyphenated)
        XCTAssertEqual(sd.asUUID(), uuid)
    }

    func testUppercaseAndMixedCaseUUIDParsing() {
        let uppercase = "6C188B48-D30E-4340-B302-397E3F84824E"
        let mixed = "6c188B48-d30E-4340-B302-397e3F84824e"
        let canonical = "6c188b48-d30e-4340-b302-397e3f84824e"

        guard let uuidUpper = LLUUID(string: uppercase), let uuidMixed = LLUUID(string: mixed) else {
            XCTFail("Failed to parse uppercase or mixed case UUID string")
            return
        }
        XCTAssertEqual(uuidUpper.description, canonical)
        XCTAssertEqual(uuidMixed.description, canonical)
        XCTAssertEqual(uuidUpper, uuidMixed)
    }

    func testInvalidUUIDParsing() {
        let invalidInputs = [
            "6c188b48-d30e-4340-b302-397e3f84824g", // invalid character 'g'
            "6c188b48-d30e-4340-b302",             // too short
            "6c188b48-d30e-4340-b302-397e3f84824e00", // too long
            "6c188b48-d30e-4340-b302-397e3f84824",   // odd hex digit count
            "",                                    // empty string
            "6c188b48 1234 5678",                  // space separator
            "invalid-uuid-string"                  // plain invalid text
        ]

        for input in invalidInputs {
            XCTAssertNil(LLUUID(string: input), "Expected nil for invalid input: \(input)")
            let sd = LLSD.string(input)
            XCTAssertEqual(sd.asUUID(), LLUUID.null, "Expected LLUUID.null from asUUID() for invalid input: \(input)")
        }
    }
}
