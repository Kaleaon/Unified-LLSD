#ifndef UNIFIED_LLSD_LLDATE_H
#define UNIFIED_LLSD_LLDATE_H

#include <string>
#include <cstdint>
#include <ostream>

namespace llsd {

class LLDate {
public:
    double mSecondsSinceEpoch;

    LLDate();
    explicit LLDate(double seconds);
    explicit LLDate(const std::string& isoStr);

    static const LLDate null;

    bool isNull() const { return mSecondsSinceEpoch == 0.0; }
    bool notNull() const { return !isNull(); }
    double secondsSinceEpoch() const { return mSecondsSinceEpoch; }
    std::string toISOString() const;

    bool operator==(const LLDate& rhs) const { return mSecondsSinceEpoch == rhs.mSecondsSinceEpoch; }
    bool operator!=(const LLDate& rhs) const { return mSecondsSinceEpoch != rhs.mSecondsSinceEpoch; }
    bool operator<(const LLDate& rhs) const { return mSecondsSinceEpoch < rhs.mSecondsSinceEpoch; }
};

inline std::ostream& operator<<(std::ostream& os, const LLDate& date) {
    return os << date.toISOString();
}

} // namespace llsd

#endif // UNIFIED_LLSD_LLDATE_H
