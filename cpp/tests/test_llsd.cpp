#include <iostream>
#include <cassert>
#include <cmath>
#include "llsd/llsd.h"
#include "llsd/llsdserialize.h"
#include "llsd/network.h"

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

    // Test 6: Network Transport & Bitmasks
    assert(llsd::PacketFlags::ZERO_CODED == 0x80);
    assert(llsd::PacketFlags::RELIABLE == 0x40);
    assert(llsd::PacketFlags::RESENT == 0x20);
    assert(llsd::PacketFlags::ACKS == 0x10);

    std::vector<uint8_t> raw = {0x80, 0x00, 0x00, 0x00, 0x01, 0x00, 0x42, 0x00, 0x03, 0x05, 0x06};
    size_t header_len = 0;
    llsd::PacketHeader header = llsd::PacketCodec::decode_header(raw, header_len);
    assert(header.is_zero_coded());
    assert(!header.is_reliable());
    assert(header.sequence_number == 1);
    assert(header.message_id == 0x42);
    assert(header_len == 7);

    std::vector<uint8_t> uncompressed = llsd::PacketCodec::zero_decode(raw, header_len);
    std::vector<uint8_t> expected_uncompressed = {0x80, 0x00, 0x00, 0x00, 0x01, 0x00, 0x42, 0x00, 0x00, 0x00, 0x05, 0x06};
    assert(uncompressed == expected_uncompressed);

    llsd::CircuitManager cm(12345);
    assert(cm.get_next_sequence_number() == 1);
    assert(cm.get_next_sequence_number() == 2);
    assert(cm.process_inbound_packet(100, true));
    assert(!cm.process_inbound_packet(100, true));

    std::cout << "All C++ LLSD Conformance Tests Passed!" << std::endl;
    return 0;
}

