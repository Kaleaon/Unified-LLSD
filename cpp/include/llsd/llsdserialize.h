#ifndef UNIFIED_LLSD_LLSDSERIALIZE_H
#define UNIFIED_LLSD_LLSDSERIALIZE_H

#include "llsd.h"
#include <iostream>
#include <string>
#include <vector>

namespace llsd {

class LLSDSerialize {
public:
    enum Format { FormatXML, FormatBinary, FormatNotation, FormatJSON };

    static const std::string BINARY_HEADER;
    static const std::string NOTATION_HEADER;
    static const std::string XML_HEADER;

    static Format detectFormat(const std::vector<uint8_t> &data);
    static LLSD parse(const std::vector<uint8_t> &data);

    static std::string toXML(const LLSD &sd, bool withDeclaration = false);
    static LLSD fromXML(const std::string &xml);

    static std::vector<uint8_t> toBinary(const LLSD &sd, bool canonical = false);
    static LLSD fromBinary(const std::vector<uint8_t> &data);

    static std::string toNotation(const LLSD &sd, bool canonical = false);
    static LLSD fromNotation(const std::string &text);

    static std::string toJSON(const LLSD &sd, bool canonical = false);
    static LLSD fromJSON(const std::string &json);
};

} // namespace llsd

#endif // UNIFIED_LLSD_LLSDSERIALIZE_H
