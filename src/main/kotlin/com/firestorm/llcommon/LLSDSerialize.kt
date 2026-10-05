package com.firestorm.llcommon

import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.StringReader
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Base64
import javax.xml.parsers.DocumentBuilderFactory
import javax.xml.transform.OutputKeys
import javax.xml.transform.TransformerFactory
import javax.xml.transform.dom.DOMSource
import javax.xml.transform.stream.StreamResult
import org.w3c.dom.Document
import org.w3c.dom.Element
import org.w3c.dom.Node
import org.xml.sax.InputSource

/**
 * LLSD (Linden Lab Structured Data) serializer/deserializer.
 *
 * Wire-format compatible with the canonical reference implementations:
 *  - python-llsd (https://github.com/secondlife/python-llsd)
 *  - Libremetaverse / OpenMetaverse OSD
 *
 * Supports XML, Notation, Binary, and (non-spec) JSON.
 */
object LLSDSerialize {

    const val BINARY_HEADER: String = "<? llsd/binary ?>\n"
    const val NOTATION_HEADER: String = "<? llsd/notation ?>\n"
    const val XML_HEADER: String = "<?xml version=\"1.0\" ?>\n"

    enum class Format { XML, BINARY, NOTATION, JSON }

    // ── Format auto-detection ────────────────────────────────────────────────

    /**
     * Parse an LLSD payload, auto-detecting the wire format from the leading
     * bytes (cookie / header). Falls back to XML when no cookie is present.
     */
    fun parse(data: ByteArray): LLSD {
        val format = detectFormat(data) ?: Format.XML
        val body = stripHeader(data, format)
        return when (format) {
            Format.BINARY -> fromBinary(body)
            Format.NOTATION -> fromNotation(body.toString(Charsets.UTF_8))
            Format.XML -> fromXML(body.toString(Charsets.UTF_8))
            Format.JSON -> fromJSON(body.toString(Charsets.UTF_8))
        }
    }

    fun detectFormat(data: ByteArray): Format? {
        val prefix = data.take(64).toByteArray().toString(Charsets.ISO_8859_1).trimStart()
        return when {
            prefix.startsWith("<?llsd/binary?>") || prefix.startsWith("<? llsd/binary ?>") -> Format.BINARY
            prefix.startsWith("<?llsd/notation?>") || prefix.startsWith("<? llsd/notation ?>") -> Format.NOTATION
            prefix.startsWith("<?xml") || prefix.startsWith("<llsd>") -> Format.XML
            prefix.startsWith("{") || prefix.startsWith("[") -> Format.JSON
            else -> null
        }
    }

    private fun stripHeader(data: ByteArray, format: Format): ByteArray {
        val text = data.toString(Charsets.ISO_8859_1)
        val newline = text.indexOf('\n')
        return when (format) {
            Format.BINARY -> if (text.startsWith("<?") && newline > 0) data.copyOfRange(newline + 1, data.size) else data
            Format.NOTATION -> if (text.startsWith("<?llsd") || text.startsWith("<? llsd")) {
                if (newline > 0) data.copyOfRange(newline + 1, data.size) else data
            } else data
            else -> data
        }
    }

    // ── XML ──────────────────────────────────────────────────────────────────

    fun toXML(sd: LLSD): String = toXML(sd, canonical = false, withDeclaration = false)

    fun toCanonicalXML(sd: LLSD): String = toXML(sd, canonical = true, withDeclaration = false)

    /** Full LLSD/XML document with `<?xml version="1.0" ?>` declaration. */
    fun toXMLDocument(sd: LLSD, canonical: Boolean = false): String =
        toXML(sd, canonical = canonical, withDeclaration = true)

    private fun toXML(sd: LLSD, canonical: Boolean, withDeclaration: Boolean): String {
        val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument()
        val root = doc.createElement("llsd")
        doc.appendChild(root)
        root.appendChild(xmlElement(doc, sd, canonical))

        val tf = TransformerFactory.newInstance().newTransformer()
        tf.setOutputProperty(OutputKeys.INDENT, "no")
        tf.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, if (withDeclaration) "no" else "yes")
        val sw = java.io.StringWriter()
        tf.transform(DOMSource(doc), StreamResult(sw))
        return sw.toString()
    }

    private fun xmlElement(doc: Document, sd: LLSD, canonical: Boolean): Element = when (sd) {
        is LLSD.Undefined -> doc.createElement("undef")
        is LLSD.LLSDBoolean -> doc.createElement("boolean").also {
            it.textContent = if (sd.value) "true" else "false"
        }
        is LLSD.LLSDInteger -> doc.createElement("integer").also { it.textContent = sd.value.toString() }
        is LLSD.LLSDReal -> doc.createElement("real").also { it.textContent = formatRealLLSD(sd.value) }
        is LLSD.LLSDString -> if (sd.value.isEmpty()) doc.createElement("string")
        else doc.createElement("string").also { it.textContent = sd.value }
        is LLSD.LLSDUUID -> if (sd.value.isNull()) doc.createElement("uuid")
        else doc.createElement("uuid").also { it.textContent = sd.value.toString() }
        is LLSD.LLSDDate -> doc.createElement("date").also { it.textContent = sd.value.toISOString() }
        is LLSD.LLSDURI -> doc.createElement("uri").also { it.textContent = sd.value.asString() }
        is LLSD.LLSDBinary -> doc.createElement("binary").also { el ->
            el.setAttribute("encoding", "base64")
            if (sd.value.isNotEmpty()) el.textContent = Base64.getEncoder().encodeToString(sd.value)
        }
        is LLSD.LLSDMap -> doc.createElement("map").also { el ->
            mapEntries(sd.value, canonical).forEach { (k, v) ->
                el.appendChild(doc.createElement("key").also { it.textContent = k })
                el.appendChild(xmlElement(doc, v, canonical))
            }
        }
        is LLSD.LLSDArray -> doc.createElement("array").also { el ->
            sd.value.forEach { el.appendChild(xmlElement(doc, it, canonical)) }
        }
    }

    private fun formatRealLLSD(v: Double): String = when {
        v.isNaN() -> "nan"
        v == Double.POSITIVE_INFINITY -> "inf"
        v == Double.NEGATIVE_INFINITY -> "-inf"
        else -> v.toString()
    }

    private fun parseRealLLSD(s: String): Double {
        val t = s.trim()
        return when (t.lowercase()) {
            "nan" -> Double.NaN
            "inf", "+inf", "infinity", "+infinity" -> Double.POSITIVE_INFINITY
            "-inf", "-infinity" -> Double.NEGATIVE_INFINITY
            else -> t.toDoubleOrNull() ?: 0.0
        }
    }

    fun fromXML(xml: String): LLSD {
        val factory = DocumentBuilderFactory.newInstance().apply {
            // Defensive: disable external entity resolution.
            try { setFeature("http://apache.org/xml/features/disallow-doctype-decl", true) } catch (_: Exception) {}
            try { setFeature("http://xml.org/sax/features/external-general-entities", false) } catch (_: Exception) {}
            try { setFeature("http://xml.org/sax/features/external-parameter-entities", false) } catch (_: Exception) {}
            isExpandEntityReferences = false
        }
        val doc = factory.newDocumentBuilder().parse(InputSource(StringReader(xml)))
        val root = doc.documentElement
        val child = firstElementChild(root) ?: return LLSD.Undefined
        return parseXmlNode(child)
    }

    private fun parseXmlNode(el: Element): LLSD = when (el.tagName) {
        "undef" -> LLSD.Undefined
        "boolean" -> {
            val t = el.textContent.trim().lowercase()
            LLSD.LLSDBoolean(t == "true" || t == "1" || t == "1.0" || t == "t")
        }
        "integer" -> LLSD.LLSDInteger(el.textContent.trim().toIntOrNull() ?: 0)
        "real" -> LLSD.LLSDReal(parseRealLLSD(el.textContent))
        "string" -> LLSD.LLSDString(el.textContent)
        "uuid" -> LLSD.LLSDUUID(LLUUID.fromString(el.textContent.trim()) ?: LLUUID.NULL)
        "date" -> LLSD.LLSDDate(LLDate.fromISOString(el.textContent.trim()) ?: LLDate.NULL)
        "uri" -> LLSD.LLSDURI(LLURI.fromString(el.textContent.trim()))
        "binary" -> {
            val text = el.textContent.trim()
            val encoding = el.getAttribute("encoding").ifEmpty { "base64" }.lowercase()
            val bytes = if (text.isEmpty()) ByteArray(0)
            else when (encoding) {
                "base64" -> Base64.getDecoder().decode(text)
                "base16" -> hexDecode(text)
                "base85" -> throw IllegalArgumentException("LLSD binary base85 is not supported")
                else -> Base64.getDecoder().decode(text)
            }
            LLSD.LLSDBinary(bytes)
        }
        "map" -> {
            val map = mutableMapOf<String, LLSD>()
            val nodes = el.childNodes
            var i = 0
            while (i < nodes.length) {
                val node = nodes.item(i)
                if (node is Element && node.tagName == "key") {
                    val key = node.textContent
                    var j = i + 1
                    while (j < nodes.length && nodes.item(j).nodeType != Node.ELEMENT_NODE) j++
                    val valNode = nodes.item(j)
                    if (valNode is Element) {
                        map[key] = parseXmlNode(valNode)
                        i = j + 1
                        continue
                    }
                }
                i++
            }
            LLSD.LLSDMap(map)
        }
        "array" -> {
            val list = mutableListOf<LLSD>()
            val nodes = el.childNodes
            for (i in 0 until nodes.length) {
                val node = nodes.item(i)
                if (node is Element) list.add(parseXmlNode(node))
            }
            LLSD.LLSDArray(list)
        }
        else -> LLSD.Undefined
    }

    private fun firstElementChild(node: Node): Element? {
        val children = node.childNodes
        for (i in 0 until children.length) {
            val child = children.item(i)
            if (child is Element) return child
        }
        return null
    }

    private fun hexDecode(s: String): ByteArray {
        val clean = s.filter { !it.isWhitespace() }
        require(clean.length % 2 == 0) { "Invalid base16 length" }
        return ByteArray(clean.length / 2) { i ->
            val hi = Character.digit(clean[i * 2], 16)
            val lo = Character.digit(clean[i * 2 + 1], 16)
            require(hi >= 0 && lo >= 0) { "Invalid base16 character" }
            ((hi shl 4) or lo).toByte()
        }
    }

    private fun hexEncode(bytes: ByteArray): String =
        bytes.joinToString("") { "%02x".format(it.toInt() and 0xff) }

    // ── Notation ─────────────────────────────────────────────────────────────

    fun toNotation(sd: LLSD): String = buildString { appendNotation(sd, canonical = false) }

    fun toCanonicalNotation(sd: LLSD): String = buildString { appendNotation(sd, canonical = true) }

    private fun StringBuilder.appendNotation(sd: LLSD, canonical: Boolean) {
        when (sd) {
            is LLSD.Undefined -> append('!')
            is LLSD.LLSDBoolean -> append(if (sd.value) "true" else "false")
            is LLSD.LLSDInteger -> append('i').append(sd.value)
            is LLSD.LLSDReal -> append('r').append(formatRealLLSD(sd.value))
            is LLSD.LLSDString -> {
                append('\'')
                for (c in sd.value) when (c) {
                    '\\' -> append("\\\\")
                    '\'' -> append("\\'")
                    else -> append(c)
                }
                append('\'')
            }
            is LLSD.LLSDUUID -> append('u').append(sd.value.toString())
            is LLSD.LLSDDate -> append("d\"").append(sd.value.toISOString()).append('"')
            is LLSD.LLSDURI -> {
                append("l\"")
                for (c in sd.value.asString()) when (c) {
                    '\\' -> append("\\\\")
                    '"' -> append("\\\"")
                    else -> append(c)
                }
                append('"')
            }
            is LLSD.LLSDBinary -> {
                append("b64\"")
                append(Base64.getEncoder().encodeToString(sd.value))
                append('"')
            }
            is LLSD.LLSDMap -> {
                append('{')
                mapEntries(sd.value, canonical).entries.forEachIndexed { idx, (k, v) ->
                    if (idx > 0) append(',')
                    append('\'')
                    for (c in k) when (c) {
                        '\\' -> append("\\\\")
                        '\'' -> append("\\'")
                        else -> append(c)
                    }
                    append("':")
                    appendNotation(v, canonical)
                }
                append('}')
            }
            is LLSD.LLSDArray -> {
                append('[')
                sd.value.forEachIndexed { idx, v ->
                    if (idx > 0) append(',')
                    appendNotation(v, canonical)
                }
                append(']')
            }
        }
    }

    fun fromNotation(text: String): LLSD {
        val stripped = if (text.startsWith("<?llsd/notation?>") || text.startsWith("<? llsd/notation ?>")) {
            val nl = text.indexOf('\n')
            if (nl >= 0) text.substring(nl + 1) else text
        } else text
        return NotationParser(stripped).parse()
    }

    private class NotationParser(private val text: String) {
        private var pos = 0

        fun parse(): LLSD {
            skipWs()
            return parseValue()
        }

        private fun skipWs() {
            while (pos < text.length && text[pos].isWhitespace()) pos++
        }

        private fun peek(): Char = if (pos < text.length) text[pos] else ' '
        private fun peekAt(offset: Int): Char =
            if (pos + offset < text.length) text[pos + offset] else ' '
        private fun consume(): Char = text[pos++]

        private fun expect(c: Char) {
            require(pos < text.length && text[pos] == c) {
                "Expected '$c' at $pos, found '${peek()}'"
            }
            pos++
        }

        fun parseValue(): LLSD {
            skipWs()
            return when (val c = peek()) {
                '!' -> { consume(); LLSD.Undefined }
                'T', 't' -> parseBoolWord(true)
                'F', 'f' -> parseBoolWord(false)
                '1' -> { consume(); LLSD.LLSDBoolean(true) }
                '0' -> { consume(); LLSD.LLSDBoolean(false) }
                'i' -> { consume(); LLSD.LLSDInteger(parseNumberWord().toIntOrNull() ?: 0) }
                'r' -> { consume(); LLSD.LLSDReal(parseRealLLSD(parseNumberWord())) }
                'u' -> { consume(); LLSD.LLSDUUID(LLUUID.fromString(parseUuidLiteral()) ?: LLUUID.NULL) }
                'd' -> { consume(); LLSD.LLSDDate(LLDate.fromISOString(parseQuotedAfterTag()) ?: LLDate.NULL) }
                'l' -> { consume(); LLSD.LLSDURI(LLURI.fromString(parseQuotedAfterTag())) }
                'b' -> parseBinaryNotation()
                's' -> parseSizedString()
                '\'' -> LLSD.LLSDString(parseSingleQuoted())
                '"' -> LLSD.LLSDString(parseDoubleQuoted())
                '{' -> parseMap()
                '[' -> parseArray()
                else -> {
                    if (c.code != 0) consume()
                    LLSD.Undefined
                }
            }
        }

        private fun parseBoolWord(value: Boolean): LLSD {
            val word = if (value) "true" else "false"
            if (text.regionMatches(pos, word, 0, word.length, ignoreCase = true)) {
                pos += word.length
            } else {
                consume()
            }
            return LLSD.LLSDBoolean(value)
        }

        private fun parseNumberWord(): String {
            val start = pos
            while (pos < text.length) {
                val c = text[pos]
                if (c.isWhitespace() || c in ",}]") break
                pos++
            }
            return text.substring(start, pos)
        }

        /** UUID is `u` followed by 36 chars of `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`. */
        private fun parseUuidLiteral(): String {
            val start = pos
            val end = (start + 36).coerceAtMost(text.length)
            pos = end
            return text.substring(start, end)
        }

        private fun parseQuotedAfterTag(): String {
            skipWs()
            return when (peek()) {
                '"' -> parseDoubleQuoted()
                '\'' -> parseSingleQuoted()
                else -> ""
            }
        }

        private fun parseDoubleQuoted(): String {
            expect('"')
            val sb = StringBuilder()
            while (pos < text.length && text[pos] != '"') {
                if (text[pos] == '\\' && pos + 1 < text.length) {
                    pos++
                    sb.append(decodeEscape(text[pos]))
                } else {
                    sb.append(text[pos])
                }
                pos++
            }
            if (pos < text.length) pos++
            return sb.toString()
        }

        private fun parseSingleQuoted(): String {
            expect('\'')
            val sb = StringBuilder()
            while (pos < text.length && text[pos] != '\'') {
                if (text[pos] == '\\' && pos + 1 < text.length) {
                    pos++
                    sb.append(decodeEscape(text[pos]))
                } else {
                    sb.append(text[pos])
                }
                pos++
            }
            if (pos < text.length) pos++
            return sb.toString()
        }

        private fun decodeEscape(c: Char): Char = when (c) {
            'n' -> '\n'
            't' -> '\t'
            'r' -> '\r'
            else -> c
        }

        /** `s(<size>)"raw"` — size-prefixed raw string. */
        private fun parseSizedString(): LLSD {
            consume() // 's'
            if (peek() == '(') {
                consume()
                val numStart = pos
                while (pos < text.length && text[pos] != ')') pos++
                val size = text.substring(numStart, pos).toIntOrNull() ?: 0
                if (pos < text.length) consume() // ')'
                if (pos < text.length && (text[pos] == '"' || text[pos] == '\'')) consume()
                val end = (pos + size).coerceAtMost(text.length)
                val s = text.substring(pos, end)
                pos = end
                if (pos < text.length && (text[pos] == '"' || text[pos] == '\'')) consume()
                return LLSD.LLSDString(s)
            }
            // Fallback: treat 's' as start of a quoted string.
            return when (peek()) {
                '"' -> LLSD.LLSDString(parseDoubleQuoted())
                '\'' -> LLSD.LLSDString(parseSingleQuoted())
                else -> LLSD.LLSDString("")
            }
        }

        /** Notation binary: `b16"<hex>"`, `b64"<base64>"`, or `b(<size>)"raw"`. */
        private fun parseBinaryNotation(): LLSD {
            consume() // 'b'
            return when {
                peekAt(0) == '6' && peekAt(1) == '4' -> {
                    pos += 2
                    val data = parseQuotedAfterTag()
                    LLSD.LLSDBinary(if (data.isEmpty()) ByteArray(0) else Base64.getDecoder().decode(data))
                }
                peekAt(0) == '1' && peekAt(1) == '6' -> {
                    pos += 2
                    val data = parseQuotedAfterTag()
                    LLSD.LLSDBinary(if (data.isEmpty()) ByteArray(0) else hexDecode(data))
                }
                peekAt(0) == '(' -> {
                    consume() // '('
                    val numStart = pos
                    while (pos < text.length && text[pos] != ')') pos++
                    val size = text.substring(numStart, pos).toIntOrNull() ?: 0
                    if (pos < text.length) consume() // ')'
                    if (pos < text.length && (text[pos] == '"' || text[pos] == '\'')) consume()
                    val end = (pos + size).coerceAtMost(text.length)
                    val bytes = ByteArray(end - pos)
                    for (i in bytes.indices) bytes[i] = text[pos + i].code.toByte()
                    pos = end
                    if (pos < text.length && (text[pos] == '"' || text[pos] == '\'')) consume()
                    LLSD.LLSDBinary(bytes)
                }
                else -> LLSD.LLSDBinary(ByteArray(0))
            }
        }

        private fun parseMap(): LLSD {
            consume() // '{'
            val map = linkedMapOf<String, LLSD>()
            skipWs()
            while (pos < text.length && peek() != '}') {
                skipWs()
                val key = when (peek()) {
                    '\'' -> parseSingleQuoted()
                    '"' -> parseDoubleQuoted()
                    's' -> {
                        val v = parseSizedString()
                        (v as? LLSD.LLSDString)?.value ?: ""
                    }
                    else -> parseNumberWord()
                }
                skipWs()
                if (peek() == ':') consume()
                skipWs()
                map[key] = parseValue()
                skipWs()
                if (peek() == ',') consume()
                skipWs()
            }
            if (pos < text.length) consume() // '}'
            return LLSD.LLSDMap(map)
        }

        private fun parseArray(): LLSD {
            consume() // '['
            val list = mutableListOf<LLSD>()
            skipWs()
            while (pos < text.length && peek() != ']') {
                list.add(parseValue())
                skipWs()
                if (peek() == ',') consume()
                skipWs()
            }
            if (pos < text.length) consume() // ']'
            return LLSD.LLSDArray(list)
        }
    }

    // ── Binary ───────────────────────────────────────────────────────────────

    fun toBinary(sd: LLSD): ByteArray = toBinary(sd, canonical = false)

    fun toCanonicalBinary(sd: LLSD): ByteArray = toBinary(sd, canonical = true)

    private fun toBinary(sd: LLSD, canonical: Boolean): ByteArray {
        val out = ByteArrayOutputStream()
        val dos = DataOutputStream(out)
        writeBinary(dos, sd, canonical)
        dos.flush()
        return out.toByteArray()
    }

    private fun uuidToBytes(uuid: LLUUID): ByteArray {
        val msb = uuid.uuid.mostSignificantBits
        val lsb = uuid.uuid.leastSignificantBits
        return ByteArray(16) { i ->
            if (i < 8) ((msb ushr ((7 - i) * 8)) and 0xffL).toByte()
            else ((lsb ushr ((15 - i) * 8)) and 0xffL).toByte()
        }
    }

    private fun uuidFromBytes(bytes: ByteArray): LLUUID {
        var msb = 0L
        var lsb = 0L
        for (i in 0..7) msb = (msb shl 8) or (bytes[i].toLong() and 0xffL)
        for (i in 8..15) lsb = (lsb shl 8) or (bytes[i].toLong() and 0xffL)
        return LLUUID(java.util.UUID(msb, lsb))
    }

    /** LLSD binary date is 8-byte little-endian IEEE-754 double seconds since epoch. */
    private fun writeDateLE(dos: DataOutputStream, seconds: Double) {
        val buf = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putDouble(seconds).array()
        dos.write(buf)
    }

    private fun readDateLE(dis: DataInputStream): Double {
        val buf = ByteArray(8).also { dis.readFully(it) }
        return ByteBuffer.wrap(buf).order(ByteOrder.LITTLE_ENDIAN).double
    }

    private fun writeBinary(dos: DataOutputStream, sd: LLSD, canonical: Boolean) {
        when (sd) {
            is LLSD.Undefined -> dos.writeByte('!'.code)
            is LLSD.LLSDBoolean -> dos.writeByte(if (sd.value) '1'.code else '0'.code)
            is LLSD.LLSDInteger -> {
                dos.writeByte('i'.code)
                dos.writeInt(sd.value)
            }
            is LLSD.LLSDReal -> {
                dos.writeByte('r'.code)
                dos.writeDouble(sd.value)
            }
            is LLSD.LLSDString -> {
                dos.writeByte('s'.code)
                val bytes = sd.value.toByteArray(Charsets.UTF_8)
                dos.writeInt(bytes.size)
                dos.write(bytes)
            }
            is LLSD.LLSDUUID -> {
                dos.writeByte('u'.code)
                dos.write(uuidToBytes(sd.value))
            }
            is LLSD.LLSDDate -> {
                dos.writeByte('d'.code)
                writeDateLE(dos, sd.value.secondsSinceEpoch)
            }
            is LLSD.LLSDURI -> {
                dos.writeByte('l'.code)
                val bytes = sd.value.asString().toByteArray(Charsets.UTF_8)
                dos.writeInt(bytes.size)
                dos.write(bytes)
            }
            is LLSD.LLSDBinary -> {
                dos.writeByte('b'.code)
                dos.writeInt(sd.value.size)
                dos.write(sd.value)
            }
            is LLSD.LLSDMap -> {
                dos.writeByte('{'.code)
                dos.writeInt(sd.value.size)
                mapEntries(sd.value, canonical).forEach { (k, v) ->
                    val kb = k.toByteArray(Charsets.UTF_8)
                    dos.writeByte('k'.code)
                    dos.writeInt(kb.size)
                    dos.write(kb)
                    writeBinary(dos, v, canonical)
                }
                dos.writeByte('}'.code)
            }
            is LLSD.LLSDArray -> {
                dos.writeByte('['.code)
                dos.writeInt(sd.value.size)
                sd.value.forEach { writeBinary(dos, it, canonical) }
                dos.writeByte(']'.code)
            }
        }
    }

    fun fromBinary(data: ByteArray): LLSD {
        // Tolerate optional `<? llsd/binary ?>\n` cookie.
        var start = 0
        if (data.size >= 2 && data[0] == '<'.code.toByte() && data[1] == '?'.code.toByte()) {
            val nl = data.indexOf('\n'.code.toByte())
            if (nl > 0) start = nl + 1
        }
        val dis = DataInputStream(java.io.ByteArrayInputStream(data, start, data.size - start))
        return readBinary(dis)
    }

    private fun ByteArray.indexOf(b: Byte, from: Int = 0): Int {
        for (i in from until size) if (this[i] == b) return i
        return -1
    }

    private fun readBinary(dis: DataInputStream): LLSD {
        val tag = dis.readByte().toInt() and 0xff
        return when (tag.toChar()) {
            '!' -> LLSD.Undefined
            '1' -> LLSD.LLSDBoolean(true)
            '0' -> LLSD.LLSDBoolean(false)
            'i' -> LLSD.LLSDInteger(dis.readInt())
            'r' -> LLSD.LLSDReal(dis.readDouble())
            's' -> {
                val len = dis.readInt()
                val bytes = ByteArray(len).also { dis.readFully(it) }
                LLSD.LLSDString(String(bytes, Charsets.UTF_8))
            }
            'u' -> {
                val bytes = ByteArray(16).also { dis.readFully(it) }
                LLSD.LLSDUUID(uuidFromBytes(bytes))
            }
            'd' -> LLSD.LLSDDate(LLDate(readDateLE(dis)))
            'l' -> {
                val len = dis.readInt()
                val bytes = ByteArray(len).also { dis.readFully(it) }
                LLSD.LLSDURI(LLURI.fromString(String(bytes, Charsets.UTF_8)))
            }
            'b' -> {
                val len = dis.readInt()
                val bytes = ByteArray(len).also { dis.readFully(it) }
                LLSD.LLSDBinary(bytes)
            }
            '{' -> {
                val count = dis.readInt()
                val map = linkedMapOf<String, LLSD>()
                repeat(count) {
                    val keyTag = dis.readByte().toInt() and 0xff
                    require(keyTag.toChar() == 'k') { "Expected 'k' map-key tag, got '${keyTag.toChar()}'" }
                    val klen = dis.readInt()
                    val kbytes = ByteArray(klen).also { dis.readFully(it) }
                    val key = String(kbytes, Charsets.UTF_8)
                    map[key] = readBinary(dis)
                }
                val closing = dis.readByte().toInt() and 0xff
                require(closing.toChar() == '}') { "Expected '}' map terminator, got '${closing.toChar()}'" }
                LLSD.LLSDMap(map)
            }
            '[' -> {
                val count = dis.readInt()
                val list = (1..count).map { readBinary(dis) }
                val closing = dis.readByte().toInt() and 0xff
                require(closing.toChar() == ']') { "Expected ']' array terminator, got '${closing.toChar()}'" }
                LLSD.LLSDArray(list)
            }
            else -> LLSD.Undefined
        }
    }

    // ── JSON (non-spec convenience) ──────────────────────────────────────────

    fun toJSON(sd: LLSD): String = buildString { appendJSON(sd, canonical = false) }

    fun toCanonicalJSON(sd: LLSD): String = buildString { appendJSON(sd, canonical = true) }

    private fun StringBuilder.appendJSON(sd: LLSD, canonical: Boolean) {
        when (sd) {
            is LLSD.Undefined -> append("null")
            is LLSD.LLSDBoolean -> append(sd.value)
            is LLSD.LLSDInteger -> append(sd.value)
            is LLSD.LLSDReal -> when {
                sd.value.isNaN() || sd.value.isInfinite() -> append("null")
                else -> append(sd.value)
            }
            is LLSD.LLSDString -> appendJSONString(sd.value)
            is LLSD.LLSDUUID -> { append('"'); append(sd.value); append('"') }
            is LLSD.LLSDDate -> { append('"'); append(sd.value.toISOString()); append('"') }
            is LLSD.LLSDURI -> { append('"'); appendJSONEscaped(sd.value.asString()); append('"') }
            is LLSD.LLSDBinary -> {
                append('"'); append(Base64.getEncoder().encodeToString(sd.value)); append('"')
            }
            is LLSD.LLSDMap -> {
                append('{')
                mapEntries(sd.value, canonical).entries.forEachIndexed { idx, (k, v) ->
                    if (idx > 0) append(',')
                    appendJSONString(k); append(':'); appendJSON(v, canonical)
                }
                append('}')
            }
            is LLSD.LLSDArray -> {
                append('[')
                sd.value.forEachIndexed { idx, v ->
                    if (idx > 0) append(',')
                    appendJSON(v, canonical)
                }
                append(']')
            }
        }
    }

    private fun StringBuilder.appendJSONString(s: String) {
        append('"'); appendJSONEscaped(s); append('"')
    }

    private fun StringBuilder.appendJSONEscaped(s: String) {
        for (c in s) when (c) {
            '"' -> append("\\\"")
            '\\' -> append("\\\\")
            '\n' -> append("\\n")
            '\r' -> append("\\r")
            '\t' -> append("\\t")
            else -> if (c.code < 0x20) append("\\u%04x".format(c.code)) else append(c)
        }
    }

    private fun mapEntries(value: Map<String, LLSD>, canonical: Boolean): Map<String, LLSD> =
        if (canonical) value.toSortedMap() else value

    fun fromJSON(json: String): LLSD = JSONParser(json.trim()).parse()

    private class JSONParser(private val text: String) {
        private var pos = 0

        fun parse(): LLSD { skipWs(); return parseValue() }

        private fun skipWs() { while (pos < text.length && text[pos].isWhitespace()) pos++ }
        private fun peek(): Char = if (pos < text.length) text[pos] else ' '
        private fun consume(): Char = text[pos++]

        private fun parseValue(): LLSD {
            skipWs()
            return when (peek()) {
                'n' -> { pos += 4; LLSD.Undefined }
                't' -> { pos += 4; LLSD.LLSDBoolean(true) }
                'f' -> { pos += 5; LLSD.LLSDBoolean(false) }
                '"' -> LLSD.LLSDString(parseString())
                '{' -> parseObject()
                '[' -> parseJSONArray()
                else -> parseNumber()
            }
        }

        private fun parseString(): String {
            consume()
            val sb = StringBuilder()
            while (pos < text.length && text[pos] != '"') {
                if (text[pos] == '\\' && pos + 1 < text.length) {
                    pos++
                    when (text[pos]) {
                        '"' -> sb.append('"')
                        '\\' -> sb.append('\\')
                        '/' -> sb.append('/')
                        'n' -> sb.append('\n')
                        'r' -> sb.append('\r')
                        't' -> sb.append('\t')
                        'b' -> sb.append('\b')
                        'u' -> {
                            if (pos + 4 < text.length) {
                                val code = text.substring(pos + 1, pos + 5).toIntOrNull(16) ?: 0
                                sb.append(code.toChar())
                                pos += 4
                            }
                        }
                        else -> sb.append(text[pos])
                    }
                } else {
                    sb.append(text[pos])
                }
                pos++
            }
            if (pos < text.length) pos++
            return sb.toString()
        }

        private fun parseNumber(): LLSD {
            val start = pos
            if (peek() == '-') pos++
            while (pos < text.length && (text[pos].isDigit() || text[pos] in ".eE+-")) pos++
            val token = text.substring(start, pos)
            return if ('.' in token || 'e' in token || 'E' in token)
                LLSD.LLSDReal(token.toDoubleOrNull() ?: 0.0)
            else
                LLSD.LLSDInteger(token.toIntOrNull() ?: 0)
        }

        private fun parseObject(): LLSD {
            consume()
            val map = linkedMapOf<String, LLSD>()
            skipWs()
            while (pos < text.length && peek() != '}') {
                skipWs()
                val key = parseString()
                skipWs(); if (peek() == ':') consume(); skipWs()
                map[key] = parseValue()
                skipWs(); if (peek() == ',') consume(); skipWs()
            }
            if (pos < text.length) consume()
            return LLSD.LLSDMap(map)
        }

        private fun parseJSONArray(): LLSD {
            consume()
            val list = mutableListOf<LLSD>()
            skipWs()
            while (pos < text.length && peek() != ']') {
                list.add(parseValue())
                skipWs()
                if (peek() == ',') consume()
                skipWs()
            }
            if (pos < text.length) consume()
            return LLSD.LLSDArray(list)
        }
    }
}
