#include "llsd/lldate.h"
#include <ctime>
#include <iomanip>
#include <sstream>

namespace llsd {

const LLDate LLDate::null(0.0);

LLDate::LLDate() : mSecondsSinceEpoch(0.0) {}

LLDate::LLDate(double seconds) : mSecondsSinceEpoch(seconds) {}

LLDate::LLDate(const std::string &isoStr) : mSecondsSinceEpoch(0.0) {
    if (isoStr.empty())
        return;
    std::tm tm = {};
    int year = 0, month = 0, day = 0, hour = 0, min = 0;
    double sec = 0.0;
    if (sscanf(isoStr.c_str(), "%d-%d-%dT%d:%d:%lf", &year, &month, &day, &hour, &min, &sec) >= 5) {
        tm.tm_year = year - 1900;
        tm.tm_mon = month - 1;
        tm.tm_mday = day;
        tm.tm_hour = hour;
        tm.tm_min = min;
        tm.tm_sec = static_cast<int>(sec);
        time_t t = timegm(&tm);
        if (t != -1) {
            mSecondsSinceEpoch = static_cast<double>(t) + (sec - static_cast<int>(sec));
        }
    }
}

std::string LLDate::toISOString() const {
    time_t t = static_cast<time_t>(mSecondsSinceEpoch);
    std::tm tm;
    gmtime_r(&t, &tm);
    char buf[64];
    double frac = mSecondsSinceEpoch - static_cast<double>(t);
    if (frac > 0.001) {
        snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%05.2fZ", tm.tm_year + 1900,
                 tm.tm_mon + 1, tm.tm_mday, tm.tm_hour, tm.tm_min,
                 static_cast<double>(tm.tm_sec) + frac);
    } else {
        snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02dZ", tm.tm_year + 1900,
                 tm.tm_mon + 1, tm.tm_mday, tm.tm_hour, tm.tm_min, tm.tm_sec);
    }
    return std::string(buf);
}

} // namespace llsd
