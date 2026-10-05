# Unified-LLSD

`Unified-LLSD` is a pure Kotlin library providing high-performance, specification-compliant Linden Lab Structured Data (LLSD) serialization, parsing, and data types.

It is wire-format compatible with canonical Linden Lab LLSD reference implementations:
- [`python-llsd`](https://github.com/secondlife/python-llsd)
- [`Libremetaverse`](https://github.com/openmetaverse/libremetaverse) / OpenMetaverse OSD
- [`secondlife/viewer`](https://github.com/secondlife/viewer) (`indra/llcommon/llsd.h`, `llsd.cpp`)

---

## Features

- **Sealed Data Model (`LLSD`)**:
  - Scalars: `Undefined`, `LLSDBoolean`, `LLSDInteger`, `LLSDReal`, `LLSDString`, `LLSDUUID`, `LLSDDate`, `LLSDURI`, `LLSDBinary`.
  - Containers: `LLSDMap`, `LLSDArray`.
  - Type-safe conversion helpers (`asBoolean()`, `asInt()`, `asReal()`, `asString()`, `asUUID()`, `asDate()`, `asURI()`, `asBinary()`, operator `get`, etc.).

- **Wire Formats (`LLSDSerialize`)**:
  - **XML**: Safe XML parsing with XXE defense; supports `<undef/>`, `<boolean>`, `<integer>`, `<real>` (with `inf`/`-inf`/`nan`), `<string>`, `<uuid>`, `<date>`, `<uri>`, `<binary>` with base64/base16 encoding attributes.
  - **Notation**: Parses and serializes notation format, including canonical map ordering, quoted/unquoted UUIDs (`u`), ISO dates (`d`), URIs (`l`), binary blobs (`b64`, `b16`, `b(N)`), sized strings (`s(N)`), and shortcuts (`1`/`0`/`t`/`f`).
  - **Binary**: Big-endian integers/doubles, little-endian 8-byte IEEE-754 date doubles, 16-byte UUIDs, length-prefixed strings/blobs, and map/array containers.
  - **JSON**: Convenient JSON mapping support for web endpoints and debugging.
  - **Auto-Detection**: `LLSDSerialize.parse(data)` auto-detects wire format based on header cookies (`<?llsd/binary?>`, `<?llsd/notation?>`, `<?xml?>`, `{`/`[`).

- **Conformance & Verification**:
  - Normative LLSD edge-case matrix documented in [`docs/llsd_edge_case_conformance.md`](docs/llsd_edge_case_conformance.md).
  - Python guardrail verification script at [`tools/verify_llsd_conformance.py`](tools/verify_llsd_conformance.py).

---

## Usage Example

```kotlin
import com.firestorm.llcommon.LLSD
import com.firestorm.llcommon.LLSDSerialize
import com.firestorm.llcommon.LLUUID

// Create an LLSD Map
val data = LLSD.map(
    "agent_id" to LLSD.uuid(LLUUID.generate()),
    "name" to LLSD.string("Avatar"),
    "balance" to LLSD.integer(1000),
    "active" to LLSD.bool(true)
)

// Serialize to XML, Notation, Binary, or JSON
val xmlString = LLSDSerialize.toXML(data)
val notationString = LLSDSerialize.toNotation(data)
val binaryBytes = LLSDSerialize.toBinary(data)
val jsonString = LLSDSerialize.toJSON(data)

// Auto-detect format and parse
val parsedFromBinary = LLSDSerialize.parse(binaryBytes)
val parsedFromXml = LLSDSerialize.fromXML(xmlString)
```

---

## Building and Testing

Requirements: JDK 17+ (JDK 21 recommended).

```bash
# Execute unit tests
./gradlew test

# Verify documentation guardrails
python3 tools/verify_llsd_conformance.py
```
