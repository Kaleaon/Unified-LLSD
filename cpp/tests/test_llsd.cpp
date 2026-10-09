#include <iostream>
#include <cassert>
#include <cmath>
#include "llsd/llsd.h"
#include "llsd/llsdserialize.h"
#include "../../bindings/cpp/AssetSchemaAdapter.h"

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

    // Test 6: Dual-Layout TextureTransform & GLTFMaterialAdapter Packing
    UnifiedLLSD::TextureTransformAdapter transformAdapter{2.0f, 3.0f, 1.5707963f, 0.5f, 0.25f};
    auto packed8 = transformAdapter.getPacked();
    auto tight5 = transformAdapter.getPackedTight();

    assert(packed8.size() == 8);
    assert(packed8[0] == 2.0f);
    assert(packed8[1] == 3.0f);
    assert(std::abs(packed8[2] - 1.5707963f) < 0.0001f);
    assert(packed8[3] == 0.0f);
    assert(packed8[4] == 0.5f);
    assert(packed8[5] == 0.25f);
    assert(packed8[6] == 0.0f);
    assert(packed8[7] == 0.0f);

    assert(tight5.size() == 5);
    assert(tight5[0] == 2.0f);
    assert(tight5[1] == 3.0f);
    assert(std::abs(tight5[2] - 1.5707963f) < 0.0001f);
    assert(tight5[3] == 0.5f);
    assert(tight5[4] == 0.25f);

    UnifiedLLSD::GLTFMaterialAdapter matAdapter;
    matAdapter.transforms.push_back(transformAdapter);
    auto matPacked8 = matAdapter.getPacked(0);
    auto matTight5 = matAdapter.getPackedTight(0);
    assert(matPacked8.size() == 8);
    assert(matPacked8[0] == 2.0f);
    assert(matPacked8[4] == 0.5f);
    assert(matTight5.size() == 5);
    assert(matTight5[3] == 0.5f);

    std::cout << "All C++ LLSD Conformance Tests Passed!" << std::endl;
    return 0;
}
