#include "llsd/llsdserialize.h"
#include <sstream>
#include <iomanip>
#include <cstring>
#include <algorithm>
#include <cmath>
#include <array>
#include <cctype>

namespace llsd {

const std::string LLSDSerialize::BINARY_HEADER = "<? llsd/binary ?>\n";
const std::string LLSDSerialize::NOTATION_HEADER = "<? llsd/notation ?>\n";
const std::string LLSDSerialize::XML_HEADER = "<?xml version=\"1.0\" ?>\n";

// --- Lookup table helpers ---
constexpr auto create_b64_index() {
    std::array<uint8_t, 256> table{};
    for (size_t i = 0; i < 256; ++i) table[i] = 0xFF;
    for (int i = 'A'; i <= 'Z'; ++i) table[i] = static_cast<uint8_t>(i - 'A');
    for (int i = 'a'; i <= 'z'; ++i) table[i] = static_cast<uint8_t>(i - 'a' + 26);
    for (int i = '0'; i <= '9'; ++i) table[i] = static_cast<uint8_t>(i - '0' + 52);
    table['+'] = 62;
    table['/'] = 63;
    return table;
}

constexpr auto create_hex_index() {
    std::array<uint8_t, 256> table{};
    for (size_t i = 0; i < 256; ++i) table[i] = 0xFF;
    for (int i = '0'; i <= '9'; ++i) table[i] = static_cast<uint8_t>(i - '0');
    for (int i = 'a'; i <= 'f'; ++i) table[i] = static_cast<uint8_t>(i - 'a' + 10);
    for (int i = 'A'; i <= 'F'; ++i) table[i] = static_cast<uint8_t>(i - 'A' + 10);
    return table;
}

static constexpr auto b64_index = create_b64_index();
static constexpr auto hex_index = create_hex_index();

// --- Base64 helpers ---
static const std::string b64_chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "0123456789+/";

static std::string base64_encode(const uint8_t* bytes, size_t len) {
    std::string ret;
    int i = 0, j = 0;
    uint8_t char_array_3[3], char_array_4[4];
    while (len--) {
        char_array_3[i++] = *(bytes++);
        if (i == 3) {
            char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
            char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
            char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
            char_array_4[3] = char_array_3[2] & 0x3f;
            for (i = 0; i < 4; i++) ret += b64_chars[char_array_4[i]];
            i = 0;
        }
    }
    if (i) {
        for (j = i; j < 3; j++) char_array_3[j] = '\0';
        char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
        char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
        char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
        for (j = 0; j < i + 1; j++) ret += b64_chars[char_array_4[j]];
        while (i++ < 3) ret += '=';
    }
    return ret;
}

static std::vector<uint8_t> base64_decode(const std::string& encoded_string) {
    int in_len = static_cast<int>(encoded_string.size());
    int i = 0, j = 0, in_ = 0;
    uint8_t char_array_4[4], char_array_3[3];
    std::vector<uint8_t> ret;
    ret.reserve((encoded_string.size() * 3) / 4);

    while (in_len-- && (encoded_string[in_] != '=') &&
           (b64_index[static_cast<uint8_t>(encoded_string[in_])] != 0xFF)) {
        char_array_4[i++] = encoded_string[in_]; in_++;
        if (i == 4) {
            for (i = 0; i < 4; i++)
                char_array_4[i] = b64_index[static_cast<uint8_t>(char_array_4[i])];
            char_array_3[0] = (char_array_4[0] << 2) + ((char_array_4[1] & 0x30) >> 4);
            char_array_3[1] = ((char_array_4[1] & 0xf) << 4) + ((char_array_4[2] & 0x3c) >> 2);
            char_array_3[2] = ((char_array_4[2] & 0x3) << 6) + char_array_4[3];
            for (i = 0; i < 3; i++) ret.push_back(char_array_3[i]);
            i = 0;
        }
    }
    if (i) {
        for (j = 0; j < i; j++)
            char_array_4[j] = b64_index[static_cast<uint8_t>(char_array_4[j])];
        char_array_3[0] = (char_array_4[0] << 2) + ((char_array_4[1] & 0x30) >> 4);
        char_array_3[1] = ((char_array_4[1] & 0xf) << 4) + ((char_array_4[2] & 0x3c) >> 2);
        for (j = 0; j < i - 1; j++) ret.push_back(char_array_3[j]);
    }
    return ret;
}

// --- Hex helpers ---
static std::vector<uint8_t> hex_decode(const std::string& str) {
    std::vector<uint8_t> bytes;
    std::string clean;
    clean.reserve(str.size());
    for (char c : str) {
        if (!std::isspace(static_cast<unsigned char>(c))) {
            clean.push_back(c);
        }
    }
    bytes.reserve(clean.size() / 2);
    size_t i = 0;
    for (; i + 1 < clean.size(); i += 2) {
        uint8_t high = hex_index[static_cast<uint8_t>(clean[i])];
        uint8_t low = hex_index[static_cast<uint8_t>(clean[i + 1])];
        if (high != 0xFF && low != 0xFF) {
            bytes.push_back(static_cast<uint8_t>((high << 4) | low));
        } else if (high != 0xFF) {
            bytes.push_back(high);
        } else {
            bytes.push_back(0);
        }
    }
    if (i < clean.size()) {
        uint8_t high = hex_index[static_cast<uint8_t>(clean[i])];
        if (high != 0xFF) {
            bytes.push_back(high);
        } else {
            bytes.push_back(0);
        }
    }
    return bytes;
}

// --- Format detection ---
LLSDSerialize::Format LLSDSerialize::detectFormat(const std::vector<uint8_t>& data) {
    std::string prefix;
    for (size_t i = 0; i < std::min<size_t>(data.size(), 64); ++i) {
        prefix.push_back(static_cast<char>(data[i]));
    }
    if (prefix.find("<?llsd/binary?>") != std::string::npos || prefix.find("<? llsd/binary ?>") != std::string::npos)
        return FormatBinary;
    if (prefix.find("<?llsd/notation?>") != std::string::npos || prefix.find("<? llsd/notation ?>") != std::string::npos)
        return FormatNotation;
    if (prefix.find("<?xml") != std::string::npos || prefix.find("<llsd>") != std::string::npos)
        return FormatXML;
    if (!prefix.empty() && (prefix[0] == '{' || prefix[0] == '['))
        return FormatJSON;
    return FormatXML;
}

LLSD LLSDSerialize::parse(const std::vector<uint8_t>& data) {
    Format fmt = detectFormat(data);
    std::string str(data.begin(), data.end());
    switch (fmt) {
        case FormatBinary: return fromBinary(data);
        case FormatNotation: return fromNotation(str);
        case FormatXML: return fromXML(str);
        case FormatJSON: return fromJSON(str);
    }
    return LLSD();
}

// --- XML Serialization / Deserialization ---
static void writeXMLElement(std::ostringstream& ss, const LLSD& sd) {
    switch (sd.type()) {
        case LLSD::TypeUndefined:
            ss << "<undef/>";
            break;
        case LLSD::TypeBoolean:
            ss << "<boolean>" << (sd.asBoolean() ? "true" : "false") << "</boolean>";
            break;
        case LLSD::TypeInteger:
            ss << "<integer>" << sd.asInteger64() << "</integer>";
            break;
        case LLSD::TypeReal: {
            double r = sd.asReal();
            if (std::isnan(r)) ss << "<real>nan</real>";
            else if (std::isinf(r)) ss << "<real>" << (r > 0 ? "inf" : "-inf") << "</real>";
            else ss << "<real>" << r << "</real>";
            break;
        }
        case LLSD::TypeString:
            if (sd.asString().empty()) ss << "<string/>";
            else ss << "<string>" << sd.asString() << "</string>";
            break;
        case LLSD::TypeUUID:
            if (sd.asUUID().isNull()) ss << "<uuid/>";
            else ss << "<uuid>" << sd.asUUID().toString() << "</uuid>";
            break;
        case LLSD::TypeDate:
            ss << "<date>" << sd.asDate().toISOString() << "</date>";
            break;
        case LLSD::TypeURI:
            ss << "<uri>" << sd.asURI().asString() << "</uri>";
            break;
        case LLSD::TypeBinary: {
            auto b = sd.asBinary();
            ss << "<binary encoding=\"base64\">" << base64_encode(b.data(), b.size()) << "</binary>";
            break;
        }
        case LLSD::TypeMap: {
            ss << "<map>";
            for (auto it = sd.beginMap(); it != sd.endMap(); ++it) {
                ss << "<key>" << it->first << "</key>";
                writeXMLElement(ss, it->second);
            }
            ss << "</map>";
            break;
        }
        case LLSD::TypeArray: {
            ss << "<array>";
            for (auto it = sd.beginArray(); it != sd.endArray(); ++it) {
                writeXMLElement(ss, *it);
            }
            ss << "</array>";
            break;
        }
    }
}

std::string LLSDSerialize::toXML(const LLSD& sd, bool withDeclaration) {
    std::ostringstream ss;
    if (withDeclaration) ss << XML_HEADER;
    ss << "<llsd>";
    writeXMLElement(ss, sd);
    ss << "</llsd>";
    return ss.str();
}

// Minimal recursive XML parser for LLSD
static std::string extractTagContent(const std::string& xml, size_t& pos, std::string& tagName, std::map<std::string, std::string>& attrs) {
    attrs.clear();
    size_t openTag = xml.find('<', pos);
    if (openTag == std::string::npos) return "";
    size_t closeTag = xml.find('>', openTag);
    if (closeTag == std::string::npos) return "";

    pos = closeTag + 1;
    std::string tagHeader = xml.substr(openTag + 1, closeTag - openTag - 1);
    if (tagHeader.empty()) return "";

    bool selfClosing = false;
    if (tagHeader.back() == '/') {
        selfClosing = true;
        tagHeader.pop_back();
    }

    std::istringstream hss(tagHeader);
    hss >> tagName;

    std::string attrPair;
    while (hss >> attrPair) {
        size_t eq = attrPair.find('=');
        if (eq != std::string::npos) {
            std::string key = attrPair.substr(0, eq);
            std::string val = attrPair.substr(eq + 1);
            if (val.size() >= 2 && (val.front() == '"' || val.front() == '\'') && val.front() == val.back()) {
                val = val.substr(1, val.size() - 2);
            }
            attrs[key] = val;
        }
    }

    if (selfClosing) return "";

    std::string endTag = "</" + tagName + ">";
    size_t endPos = xml.find(endTag, pos);
    if (endPos == std::string::npos) return "";

    std::string content = xml.substr(pos, endPos - pos);
    pos = endPos + endTag.size();
    return content;
}

static LLSD parseXMLValue(const std::string& xml, size_t& pos) {
    std::string tagName;
    std::map<std::string, std::string> attrs;
    size_t tagStart = xml.find('<', pos);
    if (tagStart == std::string::npos) return LLSD();

    // Skip xml declaration or comments
    while (tagStart != std::string::npos && (xml.compare(tagStart, 2, "<?") == 0 || xml.compare(tagStart, 4, "<!--") == 0)) {
        size_t close = xml.find('>', tagStart);
        if (close == std::string::npos) return LLSD();
        pos = close + 1;
        tagStart = xml.find('<', pos);
    }
    if (tagStart == std::string::npos) return LLSD();

    pos = tagStart;
    std::string content = extractTagContent(xml, pos, tagName, attrs);

    if (tagName == "llsd") {
        size_t innerPos = 0;
        return parseXMLValue(content, innerPos);
    } else if (tagName == "undef") {
        return LLSD();
    } else if (tagName == "boolean") {
        std::string t = content;
        std::transform(t.begin(), t.end(), t.begin(), ::tolower);
        return LLSD(t == "true" || t == "1" || t == "t");
    } else if (tagName == "integer") {
        try { return LLSD(static_cast<int64_t>(std::stoll(content))); } catch (...) { return LLSD(static_cast<int64_t>(0)); }
    } else if (tagName == "real") {
        std::string t = content;
        if (t == "nan") return LLSD(std::nan(""));
        if (t == "inf" || t == "+inf") return LLSD(INFINITY);
        if (t == "-inf") return LLSD(-INFINITY);
        try { return LLSD(std::stod(t)); } catch (...) { return LLSD(0.0); }
    } else if (tagName == "string") {
        return LLSD(content);
    } else if (tagName == "uuid") {
        return LLSD(LLUUID(content));
    } else if (tagName == "date") {
        return LLSD(LLDate(content));
    } else if (tagName == "uri") {
        return LLSD(LLURI(content));
    } else if (tagName == "binary") {
        std::string enc = attrs["encoding"];
        if (enc == "base16") return LLSD(hex_decode(content));
        return LLSD(base64_decode(content));
    } else if (tagName == "map") {
        LLSD mapSd = LLSD::emptyMap();
        size_t innerPos = 0;
        while (innerPos < content.size()) {
            std::string keyTag;
            std::map<std::string, std::string> keyAttrs;
            size_t kStart = content.find("<key>", innerPos);
            if (kStart == std::string::npos) break;
            innerPos = kStart;
            std::string keyName = extractTagContent(content, innerPos, keyTag, keyAttrs);
            LLSD valSd = parseXMLValue(content, innerPos);
            mapSd[keyName] = valSd;
        }
        return mapSd;
    } else if (tagName == "array") {
        LLSD arrSd = LLSD::emptyArray();
        size_t innerPos = 0;
        size_t idx = 0;
        while (innerPos < content.size()) {
            size_t nextTag = content.find('<', innerPos);
            if (nextTag == std::string::npos) break;
            arrSd[idx++] = parseXMLValue(content, innerPos);
        }
        return arrSd;
    }
    return LLSD();
}

LLSD LLSDSerialize::fromXML(const std::string& xml) {
    size_t pos = 0;
    return parseXMLValue(xml, pos);
}

// --- Binary Serialization / Deserialization ---
static void writeBigEndian32(std::vector<uint8_t>& buf, uint32_t v) {
    buf.push_back(static_cast<uint8_t>((v >> 24) & 0xff));
    buf.push_back(static_cast<uint8_t>((v >> 16) & 0xff));
    buf.push_back(static_cast<uint8_t>((v >> 8) & 0xff));
    buf.push_back(static_cast<uint8_t>(v & 0xff));
}

static uint32_t readBigEndian32(const uint8_t* buf) {
    return (static_cast<uint32_t>(buf[0]) << 24) |
           (static_cast<uint32_t>(buf[1]) << 16) |
           (static_cast<uint32_t>(buf[2]) << 8) |
           (static_cast<uint32_t>(buf[3]));
}

static void writeBigEndian64(std::vector<uint8_t>& buf, uint64_t v) {
    for (int i = 7; i >= 0; --i) {
        buf.push_back(static_cast<uint8_t>((v >> (i * 8)) & 0xff));
    }
}

static uint64_t readBigEndian64(const uint8_t* buf) {
    uint64_t v = 0;
    for (int i = 0; i < 8; ++i) {
        v = (v << 8) | static_cast<uint64_t>(buf[i]);
    }
    return v;
}

static void writeLittleEndian64(std::vector<uint8_t>& buf, uint64_t v) {
    for (int i = 0; i < 8; ++i) {
        buf.push_back(static_cast<uint8_t>((v >> (i * 8)) & 0xff));
    }
}

static uint64_t readLittleEndian64(const uint8_t* buf) {
    uint64_t v = 0;
    for (int i = 7; i >= 0; --i) {
        v = (v << 8) | static_cast<uint64_t>(buf[i]);
    }
    return v;
}

static void writeBinaryVal(std::vector<uint8_t>& buf, const LLSD& sd) {
    switch (sd.type()) {
        case LLSD::TypeUndefined:
            buf.push_back('!');
            break;
        case LLSD::TypeBoolean:
            buf.push_back(sd.asBoolean() ? '1' : '0');
            break;
        case LLSD::TypeInteger:
            buf.push_back('i');
            writeBigEndian32(buf, static_cast<uint32_t>(sd.asInteger()));
            break;
        case LLSD::TypeReal: {
            buf.push_back('r');
            double r = sd.asReal();
            uint64_t bits;
            std::memcpy(&bits, &r, sizeof(bits));
            writeBigEndian64(buf, bits);
            break;
        }
        case LLSD::TypeString: {
            buf.push_back('s');
            std::string s = sd.asString();
            writeBigEndian32(buf, static_cast<uint32_t>(s.size()));
            buf.insert(buf.end(), s.begin(), s.end());
            break;
        }
        case LLSD::TypeUUID: {
            buf.push_back('u');
            auto bytes = sd.asUUID().mData;
            buf.insert(buf.end(), bytes.begin(), bytes.end());
            break;
        }
        case LLSD::TypeDate: {
            buf.push_back('d');
            double sec = sd.asDate().secondsSinceEpoch();
            uint64_t bits;
            std::memcpy(&bits, &sec, sizeof(bits));
            writeLittleEndian64(buf, bits); // Date is LE 8-byte double!
            break;
        }
        case LLSD::TypeURI: {
            buf.push_back('l');
            std::string u = sd.asURI().asString();
            writeBigEndian32(buf, static_cast<uint32_t>(u.size()));
            buf.insert(buf.end(), u.begin(), u.end());
            break;
        }
        case LLSD::TypeBinary: {
            buf.push_back('b');
            auto bin = sd.asBinary();
            writeBigEndian32(buf, static_cast<uint32_t>(bin.size()));
            buf.insert(buf.end(), bin.begin(), bin.end());
            break;
        }
        case LLSD::TypeMap: {
            buf.push_back('{');
            writeBigEndian32(buf, static_cast<uint32_t>(sd.size()));
            for (auto it = sd.beginMap(); it != sd.endMap(); ++it) {
                buf.push_back('k');
                writeBigEndian32(buf, static_cast<uint32_t>(it->first.size()));
                buf.insert(buf.end(), it->first.begin(), it->first.end());
                writeBinaryVal(buf, it->second);
            }
            buf.push_back('}');
            break;
        }
        case LLSD::TypeArray: {
            buf.push_back('[');
            writeBigEndian32(buf, static_cast<uint32_t>(sd.size()));
            for (auto it = sd.beginArray(); it != sd.endArray(); ++it) {
                writeBinaryVal(buf, *it);
            }
            buf.push_back(']');
            break;
        }
    }
}

std::vector<uint8_t> LLSDSerialize::toBinary(const LLSD& sd, bool canonical) {
    (void)canonical;
    std::vector<uint8_t> buf;
    writeBinaryVal(buf, sd);
    return buf;
}

static LLSD readBinaryVal(const uint8_t* data, size_t size, size_t& pos) {
    if (pos >= size) return LLSD();
    uint8_t tag = data[pos++];
    switch (tag) {
        case '!': return LLSD();
        case '1': return LLSD(true);
        case '0': return LLSD(false);
        case 'i': {
            if (pos + 4 > size) return LLSD();
            int32_t v = static_cast<int32_t>(readBigEndian32(data + pos));
            pos += 4;
            return LLSD(static_cast<int64_t>(v));
        }
        case 'r': {
            if (pos + 8 > size) return LLSD();
            uint64_t bits = readBigEndian64(data + pos);
            pos += 8;
            double r;
            std::memcpy(&r, &bits, sizeof(r));
            return LLSD(r);
        }
        case 's': {
            if (pos + 4 > size) return LLSD();
            uint32_t len = readBigEndian32(data + pos);
            pos += 4;
            if (pos + len > size) return LLSD();
            std::string s(reinterpret_cast<const char*>(data + pos), len);
            pos += len;
            return LLSD(s);
        }
        case 'u': {
            if (pos + 16 > size) return LLSD();
            std::array<uint8_t, 16> bytes;
            std::memcpy(bytes.data(), data + pos, 16);
            pos += 16;
            return LLSD(LLUUID(bytes));
        }
        case 'd': {
            if (pos + 8 > size) return LLSD();
            uint64_t bits = readLittleEndian64(data + pos);
            pos += 8;
            double sec;
            std::memcpy(&sec, &bits, sizeof(sec));
            return LLSD(LLDate(sec));
        }
        case 'l': {
            if (pos + 4 > size) return LLSD();
            uint32_t len = readBigEndian32(data + pos);
            pos += 4;
            if (pos + len > size) return LLSD();
            std::string u(reinterpret_cast<const char*>(data + pos), len);
            pos += len;
            return LLSD(LLURI(u));
        }
        case 'b': {
            if (pos + 4 > size) return LLSD();
            uint32_t len = readBigEndian32(data + pos);
            pos += 4;
            if (pos + len > size) return LLSD();
            std::vector<uint8_t> bin(data + pos, data + pos + len);
            pos += len;
            return LLSD(bin);
        }
        case '{': {
            if (pos + 4 > size) return LLSD();
            uint32_t count = readBigEndian32(data + pos);
            pos += 4;
            LLSD mapSd = LLSD::emptyMap();
            for (uint32_t i = 0; i < count; ++i) {
                if (pos >= size || data[pos++] != 'k') break;
                if (pos + 4 > size) break;
                uint32_t klen = readBigEndian32(data + pos);
                pos += 4;
                if (pos + klen > size) break;
                std::string key(reinterpret_cast<const char*>(data + pos), klen);
                pos += klen;
                mapSd[key] = readBinaryVal(data, size, pos);
            }
            if (pos < size && data[pos] == '}') pos++;
            return mapSd;
        }
        case '[': {
            if (pos + 4 > size) return LLSD();
            uint32_t count = readBigEndian32(data + pos);
            pos += 4;
            LLSD arrSd = LLSD::emptyArray();
            for (uint32_t i = 0; i < count; ++i) {
                arrSd[i] = readBinaryVal(data, size, pos);
            }
            if (pos < size && data[pos] == ']') pos++;
            return arrSd;
        }
    }
    return LLSD();
}

LLSD LLSDSerialize::fromBinary(const std::vector<uint8_t>& data) {
    size_t pos = 0;
    // Strip header cookie if present
    if (data.size() >= BINARY_HEADER.size() &&
        std::memcmp(data.data(), BINARY_HEADER.data(), BINARY_HEADER.size()) == 0) {
        pos = BINARY_HEADER.size();
    }
    return readBinaryVal(data.data(), data.size(), pos);
}

// --- Notation Serialization / Deserialization ---
static void writeNotationVal(std::ostringstream& ss, const LLSD& sd) {
    switch (sd.type()) {
        case LLSD::TypeUndefined:
            ss << "!";
            break;
        case LLSD::TypeBoolean:
            ss << (sd.asBoolean() ? "true" : "false");
            break;
        case LLSD::TypeInteger:
            ss << "i" << sd.asInteger64();
            break;
        case LLSD::TypeReal: {
            double r = sd.asReal();
            if (std::isnan(r)) ss << "rnan";
            else if (std::isinf(r)) ss << "r" << (r > 0 ? "inf" : "-inf");
            else ss << "r" << r;
            break;
        }
        case LLSD::TypeString: {
            ss << "'";
            for (char c : sd.asString()) {
                if (c == '\'' || c == '\\') ss << '\\';
                ss << c;
            }
            ss << "'";
            break;
        }
        case LLSD::TypeUUID:
            ss << "u" << sd.asUUID().toString();
            break;
        case LLSD::TypeDate:
            ss << "d\"" << sd.asDate().toISOString() << "\"";
            break;
        case LLSD::TypeURI:
            ss << "l\"" << sd.asURI().asString() << "\"";
            break;
        case LLSD::TypeBinary: {
            auto b = sd.asBinary();
            ss << "b64\"" << base64_encode(b.data(), b.size()) << "\"";
            break;
        }
        case LLSD::TypeMap: {
            ss << "{";
            bool first = true;
            for (auto it = sd.beginMap(); it != sd.endMap(); ++it) {
                if (!first) ss << ",";
                first = false;
                ss << "'";
                for (char c : it->first) {
                    if (c == '\'' || c == '\\') ss << '\\';
                    ss << c;
                }
                ss << "':";
                writeNotationVal(ss, it->second);
            }
            ss << "}";
            break;
        }
        case LLSD::TypeArray: {
            ss << "[";
            bool first = true;
            for (auto it = sd.beginArray(); it != sd.endArray(); ++it) {
                if (!first) ss << ",";
                first = false;
                writeNotationVal(ss, *it);
            }
            ss << "]";
            break;
        }
    }
}

std::string LLSDSerialize::toNotation(const LLSD& sd, bool canonical) {
    (void)canonical;
    std::ostringstream ss;
    writeNotationVal(ss, sd);
    return ss.str();
}

static void skipNotationWs(const std::string& str, size_t& pos) {
    while (pos < str.size() && isspace(str[pos])) pos++;
}

static std::string parseQuotedString(const std::string& str, size_t& pos) {
    if (pos >= str.size()) return "";
    char quote = str[pos++];
    std::string res;
    while (pos < str.size() && str[pos] != quote) {
        if (str[pos] == '\\' && pos + 1 < str.size()) {
            pos++;
            res.push_back(str[pos]);
        } else {
            res.push_back(str[pos]);
        }
        pos++;
    }
    if (pos < str.size()) pos++;
    return res;
}

static LLSD parseNotationVal(const std::string& str, size_t& pos) {
    skipNotationWs(str, pos);
    if (pos >= str.size()) return LLSD();

    char c = str[pos];
    if (c == '!') {
        pos++;
        return LLSD();
    } else if (c == '1' || c == 't' || c == 'T') {
        if (str.compare(pos, 4, "true") == 0 || str.compare(pos, 4, "TRUE") == 0) pos += 4;
        else pos++;
        return LLSD(true);
    } else if (c == '0' || c == 'f' || c == 'F') {
        if (str.compare(pos, 5, "false") == 0 || str.compare(pos, 5, "FALSE") == 0) pos += 5;
        else pos++;
        return LLSD(false);
    } else if (c == 'i') {
        pos++;
        size_t start = pos;
        while (pos < str.size() && (isdigit(str[pos]) || str[pos] == '-')) pos++;
        std::string num = str.substr(start, pos - start);
        try { return LLSD(static_cast<int64_t>(std::stoll(num))); } catch (...) { return LLSD(static_cast<int64_t>(0)); }
    } else if (c == 'r') {
        pos++;
        size_t start = pos;
        while (pos < str.size() && (isdigit(str[pos]) || str[pos] == '.' || str[pos] == '-' || str[pos] == '+' || str[pos] == 'e' || str[pos] == 'E' || isalpha(str[pos]))) pos++;
        std::string num = str.substr(start, pos - start);
        if (num == "nan") return LLSD(std::nan(""));
        if (num == "inf" || num == "+inf") return LLSD(INFINITY);
        if (num == "-inf") return LLSD(-INFINITY);
        try { return LLSD(std::stod(num)); } catch (...) { return LLSD(0.0); }
    } else if (c == '\'') {
        return LLSD(parseQuotedString(str, pos));
    } else if (c == '"') {
        return LLSD(parseQuotedString(str, pos));
    } else if (c == 'u') {
        pos++;
        std::string uuidStr = str.substr(pos, 36);
        pos += 36;
        return LLSD(LLUUID(uuidStr));
    } else if (c == 'd') {
        pos++;
        return LLSD(LLDate(parseQuotedString(str, pos)));
    } else if (c == 'l') {
        pos++;
        return LLSD(LLURI(parseQuotedString(str, pos)));
    } else if (c == 'b') {
        if (str.compare(pos, 4, "b64\"") == 0 || str.compare(pos, 4, "b64'") == 0) {
            pos += 3;
            return LLSD(base64_decode(parseQuotedString(str, pos)));
        } else if (str.compare(pos, 4, "b16\"") == 0 || str.compare(pos, 4, "b16'") == 0) {
            pos += 3;
            return LLSD(hex_decode(parseQuotedString(str, pos)));
        }
    } else if (c == '{') {
        pos++;
        LLSD mapSd = LLSD::emptyMap();
        while (pos < str.size()) {
            skipNotationWs(str, pos);
            if (pos < str.size() && str[pos] == '}') { pos++; break; }
            std::string key = (str[pos] == '\'' || str[pos] == '"') ? parseQuotedString(str, pos) : "";
            skipNotationWs(str, pos);
            if (pos < str.size() && str[pos] == ':') pos++;
            skipNotationWs(str, pos);
            mapSd[key] = parseNotationVal(str, pos);
            skipNotationWs(str, pos);
            if (pos < str.size() && str[pos] == ',') pos++;
        }
        return mapSd;
    } else if (c == '[') {
        pos++;
        LLSD arrSd = LLSD::emptyArray();
        size_t idx = 0;
        while (pos < str.size()) {
            skipNotationWs(str, pos);
            if (pos < str.size() && str[pos] == ']') { pos++; break; }
            arrSd[idx++] = parseNotationVal(str, pos);
            skipNotationWs(str, pos);
            if (pos < str.size() && str[pos] == ',') pos++;
        }
        return arrSd;
    }
    return LLSD();
}

LLSD LLSDSerialize::fromNotation(const std::string& text) {
    size_t pos = 0;
    if (text.compare(0, NOTATION_HEADER.size(), NOTATION_HEADER) == 0) {
        pos = NOTATION_HEADER.size();
    }
    return parseNotationVal(text, pos);
}

// --- JSON Serialization / Deserialization ---
std::string LLSDSerialize::toJSON(const LLSD& sd, bool canonical) {
    (void)canonical;
    return toNotation(sd, false);
}

LLSD LLSDSerialize::fromJSON(const std::string& json) {
    return fromNotation(json);
}

} // namespace llsd
