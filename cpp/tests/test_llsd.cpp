#include <iostream>
#include <cassert>
#include <cmath>
#include "llsd/llsd.h"
#include "llsd/llsdserialize.h"

int main() {
    std::cout << "Running C++ LLSD Conformance Tests..." << std::endl;

    // Test 1: 64-bit Integer & Scalars
    int64_t bigInt = 9223372036854775807LL;
    llsd::LLSD sdInt(bigInt);
    assert(sdInt.asInteger64() == bigInt);

    // Test 2: Map and Array
    llsd::LLSD mapSd = llsd::LLSD::emptyMap();
    mapSd["int"] = bigInt;
    mapSd["str"] = "hello world";
    mapSd["bool"] = true;
    mapSd["real"] = 3.14159;
    mapSd["uuid"] = llsd::LLUUID("550e8400-e29b-41d4-a716-446655440000");

    assert(mapSd["int"].asInteger64() == bigInt);
    assert(mapSd["str"].asString() == "hello world");
    assert(mapSd["bool"].asBoolean() == true);

    // Test 3: XML Round-trip
    std::string xml = llsd::LLSDSerialize::toXML(mapSd, true);
    llsd::LLSD backXml = llsd::LLSDSerialize::fromXML(xml);
    assert(backXml["int"].asInteger64() == bigInt);
    assert(backXml["str"].asString() == "hello world");
    assert(backXml["bool"].asBoolean() == true);

    // Test 4: Binary Round-trip & Endianness (Date is LE 8-byte double, Int is BE)
    llsd::LLDate testDate(123456789.0);
    mapSd["date"] = testDate;
    std::vector<uint8_t> bin = llsd::LLSDSerialize::toBinary(mapSd);
    llsd::LLSD backBin = llsd::LLSDSerialize::fromBinary(bin);
    assert(backBin["int"].asInteger64() == static_cast<int32_t>(bigInt)); // 32-bit in binary
    assert(backBin["str"].asString() == "hello world");
    assert(std::abs(backBin["date"].asDate().secondsSinceEpoch() - 123456789.0) < 0.001);

    // Test 5: Notation Round-trip
    std::string notation = llsd::LLSDSerialize::toNotation(mapSd);
    llsd::LLSD backNotation = llsd::LLSDSerialize::fromNotation(notation);
    assert(backNotation["int"].asInteger64() == bigInt);
    assert(backNotation["str"].asString() == "hello world");

    // Test 6: LLUUID Positional Parsing
    std::string canonicalStr = "550e8400-e29b-41d4-a716-446655440000";
    llsd::LLUUID u1(canonicalStr);
    assert(u1.notNull());
    assert(u1.toString() == canonicalStr);

    std::string bracedStr = "{550e8400-e29b-41d4-a716-446655440000}";
    llsd::LLUUID u2(bracedStr);
    assert(u2.notNull());
    assert(u2 == u1);

    std::string rawHexStr = "550e8400e29b41d4a716446655440000";
    llsd::LLUUID u3(rawHexStr);
    assert(u3.notNull());
    assert(u3 == u1);

    std::string bracedRawHexStr = "{550e8400e29b41d4a716446655440000}";
    llsd::LLUUID u4(bracedRawHexStr);
    assert(u4.notNull());
    assert(u4 == u1);

    // Test Null / Invalid UUIDs
    llsd::LLUUID nullUuid("00000000-0000-0000-0000-000000000000");
    assert(nullUuid.isNull());

    assert(llsd::LLUUID("invalid-uuid-string").isNull());
    assert(llsd::LLUUID("550e8400-e29b-41d4-a716-44665544000").isNull()); // 35 chars
    assert(llsd::LLUUID("550e8400-e29b-41d4-a716-4466554400001").isNull()); // 37 chars
    assert(llsd::LLUUID("550e8400e29b-41d4-a716-446655440000").isNull()); // misplaced hyphen
    assert(llsd::LLUUID("550e8400-e29g-41d4-a716-446655440000").isNull()); // non-hex char
    assert(llsd::LLUUID("{550e8400-e29b-41d4-a716-446655440000!").isNull()); // bad brace

    std::cout << "All C++ LLSD Conformance Tests Passed!" << std::endl;
    return 0;
}
