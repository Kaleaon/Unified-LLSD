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

    // Test 6: Base16 Hex Decoding
    // XML base16 binary
    std::string xmlBase16 = "<llsd><binary encoding=\"base16\">48656c6c6f</binary></llsd>";
    llsd::LLSD parsedXmlHex = llsd::LLSDSerialize::fromXML(xmlBase16);
    assert(parsedXmlHex.isBinary());
    auto binXmlVec = parsedXmlHex.asBinary();
    std::string binXmlStr(binXmlVec.begin(), binXmlVec.end());
    assert(binXmlStr == "Hello");

    // Notation b16 binary
    std::string notationBase16 = "b16\"48656c6c6f\"";
    llsd::LLSD parsedNotationHex = llsd::LLSDSerialize::fromNotation(notationBase16);
    assert(parsedNotationHex.isBinary());
    auto binNotVec = parsedNotationHex.asBinary();
    std::string binNotStr(binNotVec.begin(), binNotVec.end());
    assert(binNotStr == "Hello");

    // Whitespace-padded & mixed-case base16 data
    std::string whitespaceBase16 = "b16\" 48 65 \n 6C 6c 6F \"";
    llsd::LLSD parsedWsHex = llsd::LLSDSerialize::fromNotation(whitespaceBase16);
    assert(parsedWsHex.isBinary());
    auto binWsVec = parsedWsHex.asBinary();
    std::string binWsStr(binWsVec.begin(), binWsVec.end());
    assert(binWsStr == "Hello");

    // Odd length payload
    std::string oddBase16 = "b16\"48656c6c6fF\"";
    llsd::LLSD parsedOddHex = llsd::LLSDSerialize::fromNotation(oddBase16);
    assert(parsedOddHex.isBinary());
    auto binOddVec = parsedOddHex.asBinary();
    assert(binOddVec.size() == 6);
    assert(binOddVec[5] == 0x0f);

    std::cout << "All C++ LLSD Conformance Tests Passed!" << std::endl;
    return 0;
}
