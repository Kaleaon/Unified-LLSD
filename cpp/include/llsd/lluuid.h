#ifndef UNIFIED_LLSD_LLUUID_H
#define UNIFIED_LLSD_LLUUID_H

#include <array>
#include <cstdint>
#include <ostream>
#include <string>

namespace llsd {

class LLUUID {
public:
    std::array<uint8_t, 16> mData;

    LLUUID();
    explicit LLUUID(const std::string &str);
    explicit LLUUID(const std::array<uint8_t, 16> &bytes);

    static const LLUUID null;

    bool isNull() const;
    bool notNull() const { return !isNull(); }
    std::string toString() const;
    static LLUUID generate();

    bool operator==(const LLUUID &rhs) const { return mData == rhs.mData; }
    bool operator!=(const LLUUID &rhs) const { return mData != rhs.mData; }
    bool operator<(const LLUUID &rhs) const { return mData < rhs.mData; }
};

inline std::ostream &operator<<(std::ostream &os, const LLUUID &uuid) {
    return os << uuid.toString();
}

} // namespace llsd

#endif // UNIFIED_LLSD_LLUUID_H
