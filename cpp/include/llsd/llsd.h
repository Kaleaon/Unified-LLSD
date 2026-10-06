#ifndef UNIFIED_LLSD_LLSD_H
#define UNIFIED_LLSD_LLSD_H

#include "lldate.h"
#include "lluri.h"
#include "lluuid.h"
#include <cstdint>
#include <iostream>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace llsd {

class LLSD {
public:
    enum Type {
        TypeUndefined = 0,
        TypeBoolean,
        TypeInteger,
        TypeReal,
        TypeString,
        TypeUUID,
        TypeDate,
        TypeURI,
        TypeBinary,
        TypeMap,
        TypeArray
    };

    typedef bool Boolean;
    typedef int64_t Integer; // 64-bit integer support
    typedef double Real;
    typedef std::string String;
    typedef LLUUID UUID;
    typedef LLDate Date;
    typedef LLURI URI;
    typedef std::vector<uint8_t> Binary;
    typedef std::map<std::string, LLSD> Map;
    typedef std::vector<LLSD> Array;

private:
    Type mType;

    Boolean mBooleanVal{false};
    Integer mIntegerVal{0};
    Real mRealVal{0.0};
    String mStringVal;
    UUID mUUIDVal;
    Date mDateVal;
    URI mURIVal;
    Binary mBinaryVal;
    Map mMapVal;
    Array mArrayVal;

public:
    LLSD() : mType(TypeUndefined) {}
    LLSD(Boolean v) : mType(TypeBoolean), mBooleanVal(v) {}
    LLSD(int32_t v) : mType(TypeInteger), mIntegerVal(v) {}
    LLSD(int64_t v) : mType(TypeInteger), mIntegerVal(v) {}
    LLSD(uint32_t v) : mType(TypeInteger), mIntegerVal(static_cast<int64_t>(v)) {}
    LLSD(uint64_t v) : mType(TypeInteger), mIntegerVal(static_cast<int64_t>(v)) {}
    LLSD(Real v) : mType(TypeReal), mRealVal(v) {}
    LLSD(const String &v) : mType(TypeString), mStringVal(v) {}
    LLSD(const char *v) : mType(TypeString), mStringVal(v ? v : "") {}
    LLSD(const UUID &v) : mType(TypeUUID), mUUIDVal(v) {}
    LLSD(const Date &v) : mType(TypeDate), mDateVal(v) {}
    LLSD(const URI &v) : mType(TypeURI), mURIVal(v) {}
    LLSD(const Binary &v) : mType(TypeBinary), mBinaryVal(v) {}
    LLSD(const Map &v) : mType(TypeMap), mMapVal(v) {}
    LLSD(const Array &v) : mType(TypeArray), mArrayVal(v) {}

    Type type() const { return mType; }
    bool isUndefined() const { return mType == TypeUndefined; }
    bool isDefined() const { return mType != TypeUndefined; }
    bool isBoolean() const { return mType == TypeBoolean; }
    bool isInteger() const { return mType == TypeInteger; }
    bool isReal() const { return mType == TypeReal; }
    bool isString() const { return mType == TypeString; }
    bool isUUID() const { return mType == TypeUUID; }
    bool isDate() const { return mType == TypeDate; }
    bool isURI() const { return mType == TypeURI; }
    bool isBinary() const { return mType == TypeBinary; }
    bool isMap() const { return mType == TypeMap; }
    bool isArray() const { return mType == TypeArray; }

    void clear() { mType = TypeUndefined; }

    Boolean asBoolean() const;
    int32_t asInteger() const { return static_cast<int32_t>(asInteger64()); }
    int64_t asInteger64() const;
    Real asReal() const;
    String asString() const;
    UUID asUUID() const;
    Date asDate() const;
    URI asURI() const;
    Binary asBinary() const;

    size_t size() const;
    bool has(const std::string &key) const;

    LLSD &operator[](const std::string &key);
    const LLSD &operator[](const std::string &key) const;
    LLSD &operator[](size_t index);
    const LLSD &operator[](size_t index) const;

    Map::const_iterator beginMap() const { return mMapVal.begin(); }
    Map::const_iterator endMap() const { return mMapVal.end(); }
    Array::const_iterator beginArray() const { return mArrayVal.begin(); }
    Array::const_iterator endArray() const { return mArrayVal.end(); }

    static LLSD emptyMap() {
        LLSD res;
        res.mType = TypeMap;
        return res;
    }
    static LLSD emptyArray() {
        LLSD res;
        res.mType = TypeArray;
        return res;
    }

    bool operator==(const LLSD &rhs) const;
    bool operator!=(const LLSD &rhs) const { return !(*this == rhs); }
};

} // namespace llsd

#endif // UNIFIED_LLSD_LLSD_H
