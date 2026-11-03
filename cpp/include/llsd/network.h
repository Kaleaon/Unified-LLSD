#ifndef LLSD_NETWORK_H
#define LLSD_NETWORK_H

#include <cstdint>
#include <vector>
#include <string>
#include <chrono>
#include <mutex>
#include <unordered_set>
#include <unordered_map>
#include <deque>
#include <algorithm>
#include <stdexcept>
#include "llsd/llsd.h"
#include "llsd/llsdserialize.h"

namespace llsd {

struct PacketFlags {
    static constexpr uint8_t NONE       = 0x00;
    static constexpr uint8_t ACKS       = 0x10;
    static constexpr uint8_t RESENT     = 0x20;
    static constexpr uint8_t RELIABLE   = 0x40;
    static constexpr uint8_t ZERO_CODED = 0x80;
};

struct PacketHeader {
    uint8_t flags{0};
    uint32_t sequence_number{0};
    uint8_t extra_bytes{0};
    uint32_t message_id{0};
    std::vector<uint32_t> acks{};

    bool is_reliable() const noexcept { return (flags & PacketFlags::RELIABLE) != 0; }
    bool is_zero_coded() const noexcept { return (flags & PacketFlags::ZERO_CODED) != 0; }
    bool is_resent() const noexcept { return (flags & PacketFlags::RESENT) != 0; }
    bool has_acks() const noexcept { return (flags & PacketFlags::ACKS) != 0; }
};

class PacketCodec {
public:
    static PacketHeader decode_header(const std::vector<uint8_t>& buffer, size_t& header_length);
    static std::vector<uint8_t> zero_decode(const std::vector<uint8_t>& src, size_t header_len);
    static std::vector<uint8_t> zero_encode(const std::vector<uint8_t>& body);
};

struct UnackedPacket {
    uint32_t sequence_number{0};
    std::vector<uint8_t> packet_data{};
    std::chrono::steady_clock::time_point sent_time{std::chrono::steady_clock::now()};
    int retries{0};
};

class CircuitManager {
private:
    uint32_t circuit_code_{0};
    mutable std::mutex mutex_{};
    uint32_t next_out_sequence_number_{1};
    std::unordered_set<uint32_t> received_sequences_{};
    std::deque<uint32_t> pending_acks_{};
    std::unordered_map<uint32_t, UnackedPacket> unacked_packets_{};
    bool is_connected_{true};
    std::chrono::steady_clock::time_point last_packet_received_time_{std::chrono::steady_clock::now()};

public:
    explicit CircuitManager(uint32_t circuit_code) : circuit_code_(circuit_code) {}

    uint32_t circuit_code() const noexcept { return circuit_code_; }
    uint32_t get_next_sequence_number();
    bool process_inbound_packet(uint32_t sequence_number, bool reliable);
    void track_outgoing_packet(uint32_t sequence_number, const std::vector<uint8_t>& packet_data);
    void process_acks(const std::vector<uint32_t>& acks);
    std::vector<uint32_t> get_pending_acks(size_t max_count = 255);
    std::vector<UnackedPacket> get_packets_to_resend(std::chrono::milliseconds timeout, int max_retries = 3);
};

struct EventQueueEvent {
    std::string event_name{};
    LLSD body{};
};

class CapabilityClient {
public:
    static std::string format_capability_request(const LLSD& payload);
    static std::vector<EventQueueEvent> parse_event_queue_response(const LLSD& response_llsd);
};

} // namespace llsd

#endif // LLSD_NETWORK_H
