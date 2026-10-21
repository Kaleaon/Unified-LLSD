#include "llsd/network.h"

namespace llsd {

PacketHeader PacketCodec::decode_header(const std::vector<uint8_t>& buffer, size_t& header_length) {
    if (buffer.size() < 6) {
        throw std::invalid_argument("Buffer too small for packet header.");
    }

    PacketHeader header{};
    header.flags = buffer[0];

    header.sequence_number = (static_cast<uint32_t>(buffer[1]) << 24) |
                             (static_cast<uint32_t>(buffer[2]) << 16) |
                             (static_cast<uint32_t>(buffer[3]) << 8)  |
                              static_cast<uint32_t>(buffer[4]);

    header.extra_bytes = buffer[5];
    size_t offset = 6 + static_cast<size_t>(header.extra_bytes);

    if (offset < buffer.size()) {
        uint8_t first = buffer[offset];
        if (first != 0xFF) {
            header.message_id = static_cast<uint32_t>(first);
            offset += 1;
        } else if (offset + 1 < buffer.size() && buffer[offset + 1] != 0xFF) {
            uint8_t second = buffer[offset + 1];
            header.message_id = (0xFF00) | static_cast<uint32_t>(second);
            offset += 2;
        } else if (offset + 3 < buffer.size()) {
            header.message_id = (static_cast<uint32_t>(buffer[offset]) << 24) |
                                (static_cast<uint32_t>(buffer[offset + 1]) << 16) |
                                (static_cast<uint32_t>(buffer[offset + 2]) << 8)  |
                                 static_cast<uint32_t>(buffer[offset + 3]);
            offset += 4;
        }
    }

    if (header.has_acks() && !buffer.empty()) {
        size_t ack_count = static_cast<size_t>(buffer.back());
        size_t acks_bytes = ack_count * 4;
        if (buffer.size() >= 1 + acks_bytes) {
            size_t ack_start = buffer.size() - 1 - acks_bytes;
            if (ack_start >= offset) {
                for (size_t i = 0; i < ack_count; ++i) {
                    size_t pos = ack_start + i * 4;
                    uint32_t ack_seq = (static_cast<uint32_t>(buffer[pos]) << 24) |
                                       (static_cast<uint32_t>(buffer[pos + 1]) << 16) |
                                       (static_cast<uint32_t>(buffer[pos + 2]) << 8)  |
                                        static_cast<uint32_t>(buffer[pos + 3]);
                    header.acks.push_back(ack_seq);
                }
            }
        }
    }

    header_length = offset;
    return header;
}

std::vector<uint8_t> PacketCodec::zero_decode(const std::vector<uint8_t>& src, size_t header_len) {
    if (src.size() <= header_len) {
        return src;
    }

    std::vector<uint8_t> dst;
    dst.reserve(src.size() * 2);
    dst.insert(dst.end(), src.begin(), src.begin() + header_len);

    size_t pos = header_len;
    while (pos < src.size()) {
        uint8_t b = src[pos++];
        if (b == 0x00) {
            if (pos < src.size()) {
                uint8_t zero_count = src[pos++];
                dst.insert(dst.end(), static_cast<size_t>(zero_count), static_cast<uint8_t>(0x00));
            } else {
                dst.push_back(0x00);
            }
        } else {
            dst.push_back(b);
        }
    }

    return dst;
}

std::vector<uint8_t> PacketCodec::zero_encode(const std::vector<uint8_t>& body) {
    std::vector<uint8_t> dst;
    dst.reserve(body.size());

    size_t i = 0;
    while (i < body.size()) {
        if (body[i] == 0x00) {
            size_t zero_start = i;
            while (i < body.size() && body[i] == 0x00 && (i - zero_start) < 255) {
                i++;
            }
            uint8_t count = static_cast<uint8_t>(i - zero_start);
            dst.push_back(0x00);
            dst.push_back(count);
        } else {
            dst.push_back(body[i++]);
        }
    }

    return dst;
}

uint32_t CircuitManager::get_next_sequence_number() {
    std::lock_guard<std::mutex> lock(mutex_);
    return next_out_sequence_number_++;
}

bool CircuitManager::process_inbound_packet(uint32_t sequence_number, bool reliable) {
    std::lock_guard<std::mutex> lock(mutex_);
    last_packet_received_time_ = std::chrono::steady_clock::now();

    if (received_sequences_.find(sequence_number) != received_sequences_.end()) {
        if (reliable) {
            pending_acks_.push_back(sequence_number);
        }
        return false;
    }

    received_sequences_.insert(sequence_number);

    if (received_sequences_.size() > 2048) {
        auto min_it = std::min_element(received_sequences_.begin(), received_sequences_.end());
        if (min_it != received_sequences_.end()) {
            received_sequences_.erase(min_it);
        }
    }

    if (reliable) {
        pending_acks_.push_back(sequence_number);
    }

    return true;
}

void CircuitManager::track_outgoing_packet(uint32_t sequence_number, const std::vector<uint8_t>& packet_data) {
    std::lock_guard<std::mutex> lock(mutex_);
    UnackedPacket packet{};
    packet.sequence_number = sequence_number;
    packet.packet_data = packet_data;
    packet.sent_time = std::chrono::steady_clock::now();
    packet.retries = 0;
    unacked_packets_[sequence_number] = packet;
}

void CircuitManager::process_acks(const std::vector<uint32_t>& acks) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (uint32_t ack : acks) {
        unacked_packets_.erase(ack);
    }
}

std::vector<uint32_t> CircuitManager::get_pending_acks(size_t max_count) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<uint32_t> result;
    while (!pending_acks_.empty() && result.size() < max_count) {
        result.push_back(pending_acks_.front());
        pending_acks_.pop_front();
    }
    return result;
}

std::vector<UnackedPacket> CircuitManager::get_packets_to_resend(std::chrono::milliseconds timeout, int max_retries) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto now = std::chrono::steady_clock::now();
    std::vector<UnackedPacket> resend_list;
    std::vector<uint32_t> timed_out_keys;

    for (auto& pair : unacked_packets_) {
        auto& packet = pair.second;
        if (now - packet.sent_time > timeout) {
            if (packet.retries >= max_retries) {
                timed_out_keys.push_back(pair.first);
            } else {
                packet.retries++;
                packet.sent_time = now;
                resend_list.push_back(packet);
            }
        }
    }

    for (uint32_t key : timed_out_keys) {
        unacked_packets_.erase(key);
    }

    return resend_list;
}

std::string CapabilityClient::format_capability_request(const LLSD& payload) {
    return LLSDSerialize::toXML(payload, true);
}

std::vector<EventQueueEvent> CapabilityClient::parse_event_queue_response(const LLSD& response_llsd) {
    std::vector<EventQueueEvent> events;
    if (response_llsd.isMap() && response_llsd.has("events")) {
        const auto& events_array = response_llsd["events"];
        if (events_array.isArray()) {
            for (size_t i = 0; i < events_array.size(); ++i) {
                const auto& evt_item = events_array[i];
                if (evt_item.isMap()) {
                    EventQueueEvent evt{};
                    if (evt_item.has("message")) {
                        evt.event_name = evt_item["message"].asString();
                    }
                    if (evt_item.has("body")) {
                        evt.body = evt_item["body"];
                    }
                    events.push_back(evt);
                }
            }
        }
    }
    return events;
}

} // namespace llsd
