#ifndef UNIFIED_LLSD_LLURI_H
#define UNIFIED_LLSD_LLURI_H

#include <string>
#include <ostream>

namespace llsd {

class LLURI {
public:
    std::string mUri;

    LLURI();
    explicit LLURI(const std::string& uri);

    std::string asString() const { return mUri; }

    bool operator==(const LLURI& rhs) const { return mUri == rhs.mUri; }
    bool operator!=(const LLURI& rhs) const { return mUri != rhs.mUri; }
};

inline std::ostream& operator<<(std::ostream& os, const LLURI& uri) {
    return os << uri.asString();
}

} // namespace llsd

#endif // UNIFIED_LLSD_LLURI_H
