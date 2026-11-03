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

    // Test 6: Base64 Decoding Tests & Edge Cases
    std::string b64Xml1 = "<llsd><binary encoding=\"base64\">SGVsbG8gV29ybGQ=</binary></llsd>";
    llsd::LLSD b64Sd1 = llsd::LLSDSerialize::fromXML(b64Xml1);
    std::vector<uint8_t> b64Expected1 = {'H', 'e', 'l', 'l', 'o', ' ', 'W', 'o', 'r', 'l', 'd'};
    assert(b64Sd1.asBinary() == b64Expected1);

    std::string b64XmlPadding1 = "<llsd><binary encoding=\"base64\">SGVsbG8=</binary></llsd>";
    llsd::LLSD b64SdPad1 = llsd::LLSDSerialize::fromXML(b64XmlPadding1);
    std::vector<uint8_t> b64ExpectedPad1 = {'H', 'e', 'l', 'l', 'o'};
    assert(b64SdPad1.asBinary() == b64ExpectedPad1);

    std::string b64XmlPadding2 = "<llsd><binary encoding=\"base64\">UVQ=</binary></llsd>";
    llsd::LLSD b64SdPad2 = llsd::LLSDSerialize::fromXML(b64XmlPadding2);
    std::vector<uint8_t> b64ExpectedPad2 = {'Q', 'T'};
    assert(b64SdPad2.asBinary() == b64ExpectedPad2);

    std::string b64Notation = "b64\"SGVsbG8gV29ybGQ=\"";
    llsd::LLSD b64SdNot = llsd::LLSDSerialize::fromNotation(b64Notation);
    assert(b64SdNot.asBinary() == b64Expected1);

    // Test 7: Hex (Base16) Decoding Tests & Edge Cases
    std::string hexXmlLower = "<llsd><binary encoding=\"base16\">48656c6c6f20576f726c64</binary></llsd>";
    llsd::LLSD hexSdLower = llsd::LLSDSerialize::fromXML(hexXmlLower);
    assert(hexSdLower.asBinary() == b64Expected1);

    std::string hexXmlUpper = "<llsd><binary encoding=\"base16\">DEADBEEF</binary></llsd>";
    llsd::LLSD hexSdUpper = llsd::LLSDSerialize::fromXML(hexXmlUpper);
    std::vector<uint8_t> hexExpectedUpper = {0xDE, 0xAD, 0xBE, 0xEF};
    assert(hexSdUpper.asBinary() == hexExpectedUpper);

    std::string hexXmlWhitespace = "<llsd><binary encoding=\"base16\"> 4865 6c6c\n6f20 576f\t726c64  </binary></llsd>";
    llsd::LLSD hexSdWS = llsd::LLSDSerialize::fromXML(hexXmlWhitespace);
    assert(hexSdWS.asBinary() == b64Expected1);

    std::string hexNotation = "b16\"deadbeef\"";
    llsd::LLSD hexSdNot = llsd::LLSDSerialize::fromNotation(hexNotation);
    assert(hexSdNot.asBinary() == hexExpectedUpper);

    std::string hexOddLength = "<llsd><binary encoding=\"base16\">41424</binary></llsd>";
    llsd::LLSD hexSdOdd = llsd::LLSDSerialize::fromXML(hexOddLength);
    std::vector<uint8_t> hexExpectedOdd = {'A', 'B', 0x04};
    assert(hexSdOdd.asBinary() == hexExpectedOdd);

    std::cout << "All C++ LLSD Conformance Tests Passed!" << std::endl;
    return 0;
}
