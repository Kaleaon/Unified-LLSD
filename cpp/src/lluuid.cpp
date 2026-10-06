#include "llsd/lluuid.h"
#include <algorithm>
#include <iomanip>
#include <random>
#include <sstream>

namespace llsd {

const LLUUID LLUUID::null;

LLUUID::LLUUID() {
    mData.fill(0);
}

LLUUID::LLUUID(const std::array<uint8_t, 16> &bytes) : mData(bytes) {}

LLUUID::LLUUID(const std::string &str) {
    mData.fill(0);
    std::string clean;
    for (char c : str) {
        if (c != '-' && c != '{' && c != '}')
            clean.push_back(c);
    }
    if (clean.size() != 32)
        return;

    for (size_t i = 0; i < 16; ++i) {
        std::string byteString = clean.substr(i * 2, 2);
        char *end = nullptr;
        mData[i] = static_cast<uint8_t>(std::strtoul(byteString.c_str(), &end, 16));
    }
}

bool LLUUID::isNull() const {
    for (uint8_t b : mData) {
        if (b != 0)
            return false;
    }
    return true;
}

std::string LLUUID::toString() const {
    std::ostringstream ss;
    ss << std::hex << std::setfill('0');
    for (size_t i = 0; i < 16; ++i) {
        if (i == 4 || i == 6 || i == 8 || i == 10)
            ss << '-';
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
