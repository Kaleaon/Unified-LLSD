#include "llsd/lluri.h"

namespace llsd {

LLURI::LLURI() : mUri("") {}

LLURI::LLURI(const std::string &uri) : mUri(uri) {}

} // namespace llsd
