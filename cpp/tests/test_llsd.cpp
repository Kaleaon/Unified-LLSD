#include <iostream>
#include <cassert>
#include <cmath>
#include <unordered_set>
#include <vector>
#include <thread>
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

    // Test 6: LLUUID Generation & Bit Settings Verification
    constexpr size_t UUID_BATCH_COUNT = 10000;
    std::unordered_set<std::string> generatedUuids;
    generatedUuids.reserve(UUID_BATCH_COUNT);

    for (size_t i = 0; i < UUID_BATCH_COUNT; ++i) {
        llsd::LLUUID genUuid = llsd::LLUUID::generate();
        assert(!genUuid.isNull());

        std::string str = genUuid.toString();
        assert(str.length() == 36);

        // Version 4 check: top 4 bits of byte 6 must be 0x4
        assert((genUuid.mData[6] & 0xf0) == 0x40);

        // Variant 1 check: top 2 bits of byte 8 must be 0x8 (10xx)
        assert((genUuid.mData[8] & 0xc0) == 0x80);

        generatedUuids.insert(str);
    }
    assert(generatedUuids.size() == UUID_BATCH_COUNT);

    // Multi-threaded thread-local engine safety verification
    constexpr size_t THREAD_COUNT = 4;
    constexpr size_t PER_THREAD_COUNT = 2500;
    std::vector<std::thread> threads;
    std::vector<std::vector<std::string>> threadResults(THREAD_COUNT);

    for (size_t t = 0; t < THREAD_COUNT; ++t) {
        threads.emplace_back([t, &threadResults]() {
            threadResults[t].reserve(PER_THREAD_COUNT);
            for (size_t i = 0; i < PER_THREAD_COUNT; ++i) {
                llsd::LLUUID u = llsd::LLUUID::generate();
                assert(!u.isNull());
                assert((u.mData[6] & 0xf0) == 0x40);
                assert((u.mData[8] & 0xc0) == 0x80);
                threadResults[t].push_back(u.toString());
            }
        });
    }

    std::unordered_set<std::string> mtUuids;
    mtUuids.reserve(THREAD_COUNT * PER_THREAD_COUNT);
    for (size_t t = 0; t < THREAD_COUNT; ++t) {
        threads[t].join();
        for (const auto& s : threadResults[t]) {
            mtUuids.insert(s);
        }
    }
    assert(mtUuids.size() == THREAD_COUNT * PER_THREAD_COUNT);

    std::cout << "All C++ LLSD Conformance Tests Passed!" << std::endl;
    return 0;
}
