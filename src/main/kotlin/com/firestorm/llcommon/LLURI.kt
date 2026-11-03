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
        val HIERARCHICAL_SCHEMES: Set<String> = setOf("http", "https", "ftp", "hop", "secondlife", "x-grid-location-info")

        private fun createAsciiMask(allowedChars: String): BooleanArray {
            val mask = BooleanArray(128)
            for (c in allowedChars) {
                val code = c.code
                if (code in 0..127) {
                    mask[code] = true
                }
            }
            return mask
        }

        val UNRESERVED: BooleanArray = createAsciiMask(
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
        )
        val QUERY_VALUE_ALLOWED: BooleanArray = createAsciiMask(
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~:@!$'()*,="
        )
        val QUERY_VARIABLE_ALLOWED: BooleanArray = createAsciiMask(
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~:@!$'()*,"
        )

        val UNRESERVED_MASK: BooleanArray get() = UNRESERVED
        val QUERY_VALUE_ALLOWED_MASK: BooleanArray get() = QUERY_VALUE_ALLOWED
        val QUERY_VARIABLE_ALLOWED_MASK: BooleanArray get() = QUERY_VARIABLE_ALLOWED

        val HEX_TABLE: Array<String> = Array(256) { i ->
            "%%%02X".format(i)
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

            if (scheme in HIERARCHICAL_SCHEMES && opaque.startsWith("//")) {
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

        fun escape(str: String): String = escapeWithAllowed(str, UNRESERVED)

        fun escapeQueryValue(str: String): String =
            escapeWithAllowed(str, QUERY_VALUE_ALLOWED)

        fun escapeQueryVariable(str: String): String =
            escapeWithAllowed(str, QUERY_VARIABLE_ALLOWED)

        fun escapeWithAllowed(str: String, allowedMask: BooleanArray): String = buildString {
            for (c in str) {
                val code = c.code
                if (code < 128 && allowedMask[code]) {
                    append(c)
                } else {
                    append(encodeChar(c))
                }
            }
        }

        fun escapeWithAllowed(str: String, allowed: String, sorted: Boolean = false): String {
            val mask = BooleanArray(128)
            var hasNonAscii = false
            var nonAsciiSet: HashSet<Char>? = null
            for (c in allowed) {
                val code = c.code
                if (code < 128) {
                    mask[code] = true
                } else {
                    hasNonAscii = true
                    if (nonAsciiSet == null) nonAsciiSet = HashSet()
                    nonAsciiSet.add(c)
                }
            }
            return buildString {
                for (c in str) {
                    val code = c.code
                    if ((code < 128 && mask[code]) || (hasNonAscii && nonAsciiSet!!.contains(c))) {
                        append(c)
                    } else {
                        append(encodeChar(c))
                    }
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
            val code = c.code
            if (code < 128) {
                return HEX_TABLE[code]
            }
            val bytes = c.toString().toByteArray(Charsets.UTF_8)
            return buildString(bytes.size * 3) {
                for (b in bytes) {
                    append(HEX_TABLE[b.toInt() and 0xFF])
                }
            }
        }

        private fun defaultPortForScheme(scheme: String): Int = when (scheme) {
            "http" -> 80
            "https" -> 443
            "ftp" -> 21
            else -> -1
        }
    }
}
