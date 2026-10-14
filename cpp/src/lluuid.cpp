#include "llsd/lluuid.h"
#include <iomanip>
#include <sstream>
#include <algorithm>
#include <random>

namespace llsd {

const LLUUID LLUUID::null;

static inline int hexNibble(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

LLUUID::LLUUID() {
    mData.fill(0);
}

LLUUID::LLUUID(const std::array<uint8_t, 16>& bytes) : mData(bytes) {}

LLUUID::LLUUID(const std::string& str) {
    mData.fill(0);
    const size_t len = str.size();
    size_t cur_pos = 0;
    bool has_hyphens = false;

    if (len == 36) {
        cur_pos = 0;
        has_hyphens = true;
    } else if (len == 38) {
        if (str[0] != '{' || str[37] != '}') {
            return;
        }
        cur_pos = 1;
        has_hyphens = true;
    } else if (len == 32) {
        cur_pos = 0;
        has_hyphens = false;
    } else {
        return;
    }

    for (size_t i = 0; i < 16; ++i) {
        if (has_hyphens && (i == 4 || i == 6 || i == 8 || i == 10)) {
            if (str[cur_pos] != '-') {
                mData.fill(0);
                return;
            }
            ++cur_pos;
        }

        int n1 = hexNibble(str[cur_pos]);
        int n2 = hexNibble(str[cur_pos + 1]);
        if (n1 < 0 || n2 < 0) {
            mData.fill(0);
            return;
        }

        mData[i] = static_cast<uint8_t>((n1 << 4) | n2);
        cur_pos += 2;
    }
}

bool LLUUID::isNull() const {
    for (uint8_t b : mData) {
        if (b != 0) return false;
    }
    return true;
}

std::string LLUUID::toString() const {
    std::ostringstream ss;
    ss << std::hex << std::setfill('0');
    for (size_t i = 0; i < 16; ++i) {
        if (i == 4 || i == 6 || i == 8 || i == 10) ss << '-';
        ss << std::setw(2) << static_cast<int>(mData[i]);
    }
    return ss.str();
}

LLUUID LLUUID::generate() {
    LLUUID uuid;
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<uint32_t> dis(0, 255);
    for (size_t i = 0; i < 16; ++i) {
        uuid.mData[i] = static_cast<uint8_t>(dis(gen));
    }
    uuid.mData[6] = (uuid.mData[6] & 0x0f) | 0x40; // Version 4
    uuid.mData[8] = (uuid.mData[8] & 0x3f) | 0x80; // Variant 1
    return uuid;
}

} // namespace llsd
