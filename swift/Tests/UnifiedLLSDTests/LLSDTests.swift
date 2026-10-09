import XCTest
import Foundation
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

    func testBinaryRoundtripAllTypes() {
        guard let uuid = LLUUID(string: "d7be0172-11c5-4927-a0d4-123456789abc") else {
            XCTFail("Failed to create UUID")
            return
        }
        let date = LLDate(secondsSinceEpoch: 1700000000.0)
        let uri = LLURI(uriString: "http://example.com/api")
        let blob = Data([1, 2, 3, 255, 0, 128])

        let innerMap: [String: LLSD] = [
            "uuid_key": .uuid(uuid),
            "uri_key": .uri(uri),
            "blob_key": .binary(blob),
            "str_key": .string("Hello World")
        ]

        let arr: [LLSD] = [
            .undefined,
            .boolean(true),
            .boolean(false),
            .integer(100),
            .real(3.14159),
            .map(innerMap)
        ]

        let rootMap: [String: LLSD] = [
            "array_val": .array(arr),
            "date_val": .date(date),
            "name": .string("Grid Capability")
        ]

        let root = LLSD.map(rootMap)
        let bin = LLSDSerialize.toBinary(root)
        let back = LLSDSerialize.fromBinary(bin)

        XCTAssertEqual(back["name"].asString(), "Grid Capability")
        XCTAssertEqual(back["date_val"].asDate().secondsSinceEpoch, 1700000000.0, accuracy: 0.001)

        let backArr = back["array_val"]
        XCTAssertTrue(backArr[0].isUndefined)
        XCTAssertTrue(backArr[1].asBoolean())
        XCTAssertFalse(backArr[2].asBoolean())
        XCTAssertEqual(backArr[3].asInt64(), 100)
        XCTAssertEqual(backArr[4].asDouble(), 3.14159, accuracy: 0.0001)

        let backInnerMap = backArr[5]
        XCTAssertEqual(backInnerMap["uuid_key"].asUUID().description, "d7be0172-11c5-4927-a0d4-123456789abc")
        XCTAssertEqual(backInnerMap["uri_key"].asURI().uriString, "http://example.com/api")
        if case .binary(let b) = backInnerMap["blob_key"] {
            XCTAssertEqual(b, blob)
        } else {
            XCTFail("Expected binary data")
        }
        XCTAssertEqual(backInnerMap["str_key"].asString(), "Hello World")
    }

    func testNotationRoundtripAllTypes() {
        guard let uuid = LLUUID(string: "d7be0172-11c5-4927-a0d4-123456789abc") else {
            XCTFail("Failed to create UUID")
            return
        }
        guard let date = LLDate(isoString: "2023-05-01T12:00:00Z") else {
            XCTFail("Failed to create Date")
            return
        }
        let uri = LLURI(uriString: "http://secondlife.com")
        let blob = Data([10, 20, 30])

        let map: [String: LLSD] = [
            "u": .uuid(uuid),
            "d": .date(date),
            "l": .uri(uri),
            "b": .binary(blob),
            "s": .string("test string"),
            "arr": .array([.integer(1), .string("item2")])
        ]

        let root = LLSD.map(map)
        let notation = LLSDSerialize.toNotation(root)
        let back = LLSDSerialize.fromNotation(notation)

        XCTAssertEqual(back["u"].asUUID().description, "d7be0172-11c5-4927-a0d4-123456789abc")
        XCTAssertEqual(back["l"].asURI().uriString, "http://secondlife.com")
        if case .binary(let b) = back["b"] {
            XCTAssertEqual(b, blob)
        } else {
            XCTFail("Expected binary data")
        }
        XCTAssertEqual(back["s"].asString(), "test string")
        XCTAssertEqual(back["arr"][0].asInt64(), 1)
        XCTAssertEqual(back["arr"][1].asString(), "item2")
    }

    func testXMLRoundtripAllTypes() {
        guard let uuid = LLUUID(string: "d7be0172-11c5-4927-a0d4-123456789abc") else {
            XCTFail("Failed to create UUID")
            return
        }
        guard let date = LLDate(isoString: "2023-05-01T12:00:00Z") else {
            XCTFail("Failed to create Date")
            return
        }
        let uri = LLURI(uriString: "http://secondlife.com")
        let blob = Data([10, 20, 30])

        let map: [String: LLSD] = [
            "u": .uuid(uuid),
            "d": .date(date),
            "l": .uri(uri),
            "b": .binary(blob),
            "s": .string("xml string & <tag>"),
            "i": .integer(12345),
            "r": .real(2.718),
            "bool": .boolean(true),
            "undef": .undefined
        ]

        let root = LLSD.map(map)
        let xml = LLSDSerialize.toXML(root, withDeclaration: true)
        let back = LLSDSerialize.fromXML(xml)

        XCTAssertEqual(back["u"].asUUID().description, "d7be0172-11c5-4927-a0d4-123456789abc")
        XCTAssertEqual(back["l"].asURI().uriString, "http://secondlife.com")
        if case .binary(let b) = back["b"] {
            XCTAssertEqual(b, blob)
        } else {
            XCTFail("Expected binary data")
        }
        XCTAssertEqual(back["s"].asString(), "xml string & <tag>")
        XCTAssertEqual(back["i"].asInt64(), 12345)
        XCTAssertEqual(back["r"].asDouble(), 2.718, accuracy: 0.001)
        XCTAssertTrue(back["bool"].asBoolean())
        XCTAssertTrue(back["undef"].isUndefined)
    }
}
