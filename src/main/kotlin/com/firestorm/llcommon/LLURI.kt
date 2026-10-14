package com.firestorm.llcommon

import java.net.URI
import java.net.URISyntaxException

class LLURI private constructor(
    val scheme: String,
    val escapedOpaque: String,
    val escapedAuthority: String,
    val escapedPath: String,
    val escapedQuery: String
) {
    constructor() : this("", "", "", "", "")

    val authority: String get() = unescape(escapedAuthority)
    val path: String get() = unescape(escapedPath)
    val query: String get() = unescape(escapedQuery)

    val hostName: String get() {
        val auth = escapedAuthority
        val atIdx = auth.lastIndexOf('@')
        val hostPart = if (atIdx >= 0) auth.substring(atIdx + 1) else auth
        val colonIdx = hostPart.lastIndexOf(':')
        return if (colonIdx >= 0) unescape(hostPart.substring(0, colonIdx)) else unescape(hostPart)
    }

    val hostPort: Int get() {
        val auth = escapedAuthority
        val atIdx = auth.lastIndexOf('@')
        val hostPart = if (atIdx >= 0) auth.substring(atIdx + 1) else auth
        val colonIdx = hostPart.lastIndexOf(':')
        if (colonIdx < 0) return defaultPortForScheme(scheme)
        return hostPart.substring(colonIdx + 1).toIntOrNull() ?: defaultPortForScheme(scheme)
    }

    val hostNameAndPort: String get() {
        val auth = escapedAuthority
        val atIdx = auth.lastIndexOf('@')
        return if (atIdx >= 0) auth.substring(atIdx + 1) else auth
    }

    val userName: String get() {
        val auth = escapedAuthority
        val atIdx = auth.indexOf('@')
        if (atIdx < 0) return ""
        val userPass = auth.substring(0, atIdx)
        val colonIdx = userPass.indexOf(':')
        return unescape(if (colonIdx >= 0) userPass.substring(0, colonIdx) else userPass)
    }

    val password: String get() {
        val auth = escapedAuthority
        val atIdx = auth.indexOf('@')
        if (atIdx < 0) return ""
        val userPass = auth.substring(0, atIdx)
        val colonIdx = userPass.indexOf(':')
        return if (colonIdx >= 0) unescape(userPass.substring(colonIdx + 1)) else ""
    }

    fun isDefaultPort(): Boolean = hostPort == defaultPortForScheme(scheme)

    fun isValid(): Boolean {
        if (scheme.isEmpty() && escapedOpaque.isEmpty()) return false
        return try {
            URI(asString())
            true
        } catch (_: URISyntaxException) {
            false
        }
    }

    fun asString(): String {
        if (scheme.isEmpty()) return escapedOpaque
        val opaque = if (escapedOpaque.isNotEmpty()) escapedOpaque
            else buildString {
                if (escapedAuthority.isNotEmpty()) append("//").append(escapedAuthority)
                append(escapedPath)
                if (escapedQuery.isNotEmpty()) append('?').append(escapedQuery)
            }
        return "$scheme:$opaque"
    }

    fun queryMap(): Map<String, String> {
        if (escapedQuery.isEmpty()) return emptyMap()
        return escapedQuery.split('&').mapNotNull { pair ->
            val eqIdx = pair.indexOf('=')
            if (eqIdx < 0) null
            else unescape(pair.substring(0, eqIdx)) to unescape(pair.substring(eqIdx + 1))
        }.toMap()
    }

    override fun toString(): String = asString()

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is LLURI) return false
        return asString() == other.asString()
    }

    override fun hashCode(): Int = asString().hashCode()

    companion object {
        private const val UNRESERVED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
        private val UNRESERVED_SORTED = UNRESERVED.toSortedSet().joinToString("")
        private val QUERY_VALUE_ALLOWED = UNRESERVED + ":@!$'()*,="
        private val QUERY_VARIABLE_ALLOWED = UNRESERVED + ":@!$'()*,"

        private val HEX_DIGITS = charArrayOf(
            '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'
        )

        private val UNRESERVED_TABLE = BooleanArray(128).apply {
            for (ch in UNRESERVED) {
                if (ch.code < 128) this[ch.code] = true
            }
        }

        private val QUERY_VALUE_TABLE = BooleanArray(128).apply {
            for (ch in QUERY_VALUE_ALLOWED) {
                if (ch.code < 128) this[ch.code] = true
            }
        }

        private val QUERY_VARIABLE_TABLE = BooleanArray(128).apply {
            for (ch in QUERY_VARIABLE_ALLOWED) {
                if (ch.code < 128) this[ch.code] = true
            }
        }

        fun fromString(s: String): LLURI {
            val colonIdx = s.indexOf(':')
            val scheme: String
            val opaque: String
            if (colonIdx < 0) {
                scheme = ""
                opaque = s
            } else {
                scheme = s.substring(0, colonIdx)
                opaque = s.substring(colonIdx + 1)
            }
            return parseOpaque(scheme, opaque)
        }

        private fun parseOpaque(scheme: String, opaque: String): LLURI {
            var authority = ""
            var path = opaque
            var query = ""

            val hierarchical = setOf("http", "https", "ftp", "hop", "secondlife", "x-grid-location-info")
            if (scheme in hierarchical && opaque.startsWith("//")) {
                val withoutSlashes = opaque.substring(2)
                val slashIdx = withoutSlashes.indexOf('/')
                val queryIdx = withoutSlashes.indexOf('?')
                when {
                    slashIdx < 0 && queryIdx < 0 -> {
                        authority = withoutSlashes
                        path = ""
                    }
                    queryIdx >= 0 && (slashIdx < 0 || queryIdx < slashIdx) -> {
                        authority = withoutSlashes.substring(0, queryIdx)
                        path = withoutSlashes.substring(queryIdx)
                    }
                    else -> {
                        authority = withoutSlashes.substring(0, slashIdx)
                        path = withoutSlashes.substring(slashIdx)
                    }
                }
            } else if (scheme == "about") {
                path = opaque
            }

            val queryDelim = path.indexOf('?')
            if (queryDelim >= 0) {
                query = path.substring(queryDelim + 1)
                path = path.substring(0, queryDelim)
            }

            return LLURI(scheme, opaque, authority, path, query)
        }

        fun buildHTTP(host: String, port: Int, escapedPath: String, escapedQuery: String = ""): LLURI {
            val scheme = "http"
            val authority = if (port == 80) host else "$host:$port"
            val opaque = "//$authority$escapedPath${if (escapedQuery.isNotEmpty()) "?$escapedQuery" else ""}"
            return LLURI(scheme, opaque, authority, escapedPath, escapedQuery)
        }

        fun escape(str: String): String = escapeWithAllowed(str, UNRESERVED_SORTED, sorted = true)

        fun escapeQueryValue(str: String): String =
            escapeWithAllowed(str, QUERY_VALUE_ALLOWED, sorted = false)

        fun escapeQueryVariable(str: String): String =
            escapeWithAllowed(str, QUERY_VARIABLE_ALLOWED, sorted = false)

        fun escapeWithAllowed(str: String, allowed: String, sorted: Boolean = false): String {
            if (str.isEmpty()) return str

            val (table, customNonAsciiSet) = when {
                allowed === UNRESERVED || allowed === UNRESERVED_SORTED || allowed == UNRESERVED || allowed == UNRESERVED_SORTED ->
                    UNRESERVED_TABLE to null
                allowed === QUERY_VALUE_ALLOWED || allowed == QUERY_VALUE_ALLOWED ->
                    QUERY_VALUE_TABLE to null
                allowed === QUERY_VARIABLE_ALLOWED || allowed == QUERY_VARIABLE_ALLOWED ->
                    QUERY_VARIABLE_TABLE to null
                else ->
                    buildCustomLookupTable(allowed)
            }

            var firstDirtyIndex = -1
            for (i in 0 until str.length) {
                val c = str[i]
                val isAllowed = if (c.code < 128) {
                    table[c.code]
                } else {
                    customNonAsciiSet?.contains(c) == true
                }
                if (!isAllowed) {
                    firstDirtyIndex = i
                    break
                }
            }

            if (firstDirtyIndex == -1) {
                return str
            }

            val sb = StringBuilder(str.length + 16)
            sb.append(str, 0, firstDirtyIndex)

            var i = firstDirtyIndex
            while (i < str.length) {
                val c = str[i]
                if (c.code < 128) {
                    if (table[c.code]) {
                        sb.append(c)
                    } else {
                        appendPercentByte(sb, c.code)
                    }
                    i++
                } else {
                    if (customNonAsciiSet?.contains(c) == true) {
                        sb.append(c)
                    } else if (c.isHighSurrogate() && i + 1 < str.length && str[i + 1].isLowSurrogate()) {
                        val cp = Character.toCodePoint(c, str[i + 1])
                        encodeCodePointToUtf8(sb, cp)
                        i += 2
                    } else {
                        encodeCodePointToUtf8(sb, c.code)
                        i++
                    }
                }
            }

            return sb.toString()
        }

        private fun buildCustomLookupTable(allowed: String): Pair<BooleanArray, Set<Char>?> {
            val table = BooleanArray(128)
            var nonAsciiSet: MutableSet<Char>? = null
            for (i in 0 until allowed.length) {
                val ch = allowed[i]
                if (ch.code < 128) {
                    table[ch.code] = true
                } else {
                    if (nonAsciiSet == null) nonAsciiSet = HashSet()
                    nonAsciiSet.add(ch)
                }
            }
            return Pair(table, nonAsciiSet)
        }

        private fun appendPercentByte(sb: StringBuilder, b: Int) {
            sb.append('%')
            sb.append(HEX_DIGITS[(b ushr 4) and 0x0F])
            sb.append(HEX_DIGITS[b and 0x0F])
        }

        private fun encodeCodePointToUtf8(sb: StringBuilder, cp: Int) {
            when {
                cp <= 0x7F -> {
                    appendPercentByte(sb, cp)
                }
                cp <= 0x7FF -> {
                    appendPercentByte(sb, 0xC0 or (cp ushr 6))
                    appendPercentByte(sb, 0x80 or (cp and 0x3F))
                }
                cp <= 0xFFFF -> {
                    appendPercentByte(sb, 0xE0 or (cp ushr 12))
                    appendPercentByte(sb, 0x80 or ((cp ushr 6) and 0x3F))
                    appendPercentByte(sb, 0x80 or (cp and 0x3F))
                }
                else -> {
                    appendPercentByte(sb, 0xF0 or (cp ushr 18))
                    appendPercentByte(sb, 0x80 or ((cp ushr 12) and 0x3F))
                    appendPercentByte(sb, 0x80 or ((cp ushr 6) and 0x3F))
                    appendPercentByte(sb, 0x80 or (cp and 0x3F))
                }
            }
        }

        fun unescape(str: String): String = buildString {
            var i = 0
            while (i < str.length) {
                if (str[i] == '%' && i + 2 < str.length) {
                    val hex = str.substring(i + 1, i + 3)
                    val byte = hex.toIntOrNull(16)
                    if (byte != null) {
                        append(byte.toChar())
                        i += 3
                        continue
                    }
                }
                append(str[i])
                i++
            }
        }

        private fun encodeChar(c: Char): String {
            val bytes = c.toString().toByteArray(Charsets.UTF_8)
            return bytes.joinToString("") { b -> "%%%02X".format(b) }
        }

        private fun defaultPortForScheme(scheme: String): Int = when (scheme) {
            "http" -> 80
            "https" -> 443
            "ftp" -> 21
            else -> -1
        }
    }
}
