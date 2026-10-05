#include "llsd/llsd.h"
#include <sstream>
#include <cmath>

namespace llsd {

static LLSD gNullLLSD;

LLSD::Boolean LLSD::asBoolean() const {
    switch (mType) {
        case TypeBoolean: return mBooleanVal;
        case TypeInteger: return mIntegerVal != 0;
        case TypeReal: return mRealVal != 0.0;
        case TypeString: return !mStringVal.empty();
        case TypeUUID: return mUUIDVal.notNull();
        case TypeDate: return mDateVal.notNull();
        case TypeURI: return !mURIVal.asString().empty();
        case TypeBinary: return !mBinaryVal.empty();
        case TypeMap: return !mMapVal.empty();
        case TypeArray: return !mArrayVal.empty();
        default: return false;
    }
}

int64_t LLSD::asInteger64() const {
    switch (mType) {
        case TypeBoolean: return mBooleanVal ? 1 : 0;
        case TypeInteger: return mIntegerVal;
        case TypeReal: return static_cast<int64_t>(mRealVal);
        case TypeString: {
            if (mStringVal.empty()) return 0;
            try { return std::stoll(mStringVal); } catch (...) { return 0; }
        }
        default: return 0;
    }
}

LLSD::Real LLSD::asReal() const {
    switch (mType) {
        case TypeBoolean: return mBooleanVal ? 1.0 : 0.0;
        case TypeInteger: return static_cast<double>(mIntegerVal);
        case TypeReal: return mRealVal;
        case TypeString: {
            if (mStringVal.empty()) return 0.0;
            if (mStringVal == "nan" || mStringVal == "NaN") return std::nan("");
            if (mStringVal == "inf" || mStringVal == "+inf") return INFINITY;
            if (mStringVal == "-inf") return -INFINITY;
            try { return std::stod(mStringVal); } catch (...) { return 0.0; }
        }
        default: return 0.0;
    }
}

LLSD::String LLSD::asString() const {
    switch (mType) {
        case TypeBoolean: return mBooleanVal ? "true" : "false";
        case TypeInteger: return std::to_string(mIntegerVal);
        case TypeReal: {
            if (std::isnan(mRealVal)) return "nan";
            if (std::isinf(mRealVal)) return mRealVal > 0 ? "inf" : "-inf";
            std::ostringstream ss;
            ss << mRealVal;
            return ss.str();
        }
        case TypeString: return mStringVal;
        case TypeUUID: return mUUIDVal.toString();
        case TypeDate: return mDateVal.toISOString();
        case TypeURI: return mURIVal.asString();
        default: return "";
    }
}

LLSD::UUID LLSD::asUUID() const {
    if (mType == TypeUUID) return mUUIDVal;
    if (mType == TypeString) return LLUUID(mStringVal);
    return LLUUID::null;
}

LLSD::Date LLSD::asDate() const {
    if (mType == TypeDate) return mDateVal;
    if (mType == TypeString) return LLDate(mStringVal);
    return LLDate::null;
}

LLSD::URI LLSD::asURI() const {
    if (mType == TypeURI) return mURIVal;
    if (mType == TypeString) return LLURI(mStringVal);
    return LLURI();
}

LLSD::Binary LLSD::asBinary() const {
    if (mType == TypeBinary) return mBinaryVal;
    return Binary();
}

size_t LLSD::size() const {
    if (mType == TypeMap) return mMapVal.size();
    if (mType == TypeArray) return mArrayVal.size();
    return 0;
}

bool LLSD::has(const std::string& key) const {
    if (mType == TypeMap) return mMapVal.find(key) != mMapVal.end();
    return false;
}

LLSD& LLSD::operator[](const std::string& key) {
    if (mType != TypeMap) {
        mType = TypeMap;
        mMapVal.clear();
    }
    return mMapVal[key];
}

const LLSD& LLSD::operator[](const std::string& key) const {
    if (mType == TypeMap) {
        auto it = mMapVal.find(key);
        if (it != mMapVal.end()) return it->second;
    }
    return gNullLLSD;
}

LLSD& LLSD::operator[](size_t index) {
    if (mType != TypeArray) {
        mType = TypeArray;
        mArrayVal.clear();
    }
    if (index >= mArrayVal.size()) {
        mArrayVal.resize(index + 1);
    }
    return mArrayVal[index];
}

const LLSD& LLSD::operator[](size_t index) const {
    if (mType == TypeArray && index < mArrayVal.size()) {
        return mArrayVal[index];
    }
    return gNullLLSD;
}

bool LLSD::operator==(const LLSD& rhs) const {
    if (mType != rhs.mType) return false;
    switch (mType) {
        case TypeUndefined: return true;
        case TypeBoolean: return mBooleanVal == rhs.mBooleanVal;
        case TypeInteger: return mIntegerVal == rhs.mIntegerVal;
        case TypeReal: return mRealVal == rhs.mRealVal;
        case TypeString: return mStringVal == rhs.mStringVal;
        case TypeUUID: return mUUIDVal == rhs.mUUIDVal;
        case TypeDate: return mDateVal == rhs.mDateVal;
        case TypeURI: return mURIVal == rhs.mURIVal;
        case TypeBinary: return mBinaryVal == rhs.mBinaryVal;
        case TypeMap: return mMapVal == rhs.mMapVal;
        case TypeArray: return mArrayVal == rhs.mArrayVal;
    }
    return false;
}

} // namespace llsd
