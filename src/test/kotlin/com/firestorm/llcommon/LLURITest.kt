package com.firestorm.llcommon

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame
import kotlin.test.assertTrue

class LLURITest {

    @Test
    fun testFastPathPassThroughCleanStrings() {
        // Clean unreserved strings should return the exact same String instance without allocations
        val clean1 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~"
        val escaped1 = LLURI.escape(clean1)
        assertSame(clean1, escaped1, "Clean unreserved string must return same instance")

        // Clean query value string containing allowed query value characters
        val cleanQueryVal = "user_123:@!$'()*,="
        val escapedQueryVal = LLURI.escapeQueryValue(cleanQueryVal)
        assertSame(cleanQueryVal, escapedQueryVal, "Clean query value string must return same instance")

        // Clean query variable string
        val cleanQueryVar = "var123:@!$'()*,"
        val escapedQueryVar = LLURI.escapeQueryVariable(cleanQueryVar)
        assertSame(cleanQueryVar, escapedQueryVar, "Clean query variable string must return same instance")

        // Empty string
        val emptyStr = ""
        assertSame(emptyStr, LLURI.escape(emptyStr))
        assertSame(emptyStr, LLURI.escapeQueryValue(emptyStr))
        assertSame(emptyStr, LLURI.escapeQueryVariable(emptyStr))
    }

    @Test
    fun testEscapingDirtyASCIIStrings() {
        assertEquals("hello%20world", LLURI.escape("hello world"))
        assertEquals("user%40example.com", LLURI.escape("user@example.com"))
        assertEquals("%20%21%23", LLURI.escape(" !#"))
        assertEquals("key%3Dvalue%26foo%3Dbar", LLURI.escape("key=value&foo=bar"))

        // Query value allows ':', '@', '!', '$', '\'', '(', ')', '*', ',', '=' unescaped, but escapes ' ', '&', '?'
        assertEquals("user@domain:80!$'()*,=foo%26bar", LLURI.escapeQueryValue("user@domain:80!$'()*,=foo&bar"))
        assertEquals("user@domain:80!$'()*,=%20foo%26bar", LLURI.escapeQueryValue("user@domain:80!$'()*,= foo&bar"))

        // Query variable allows ':', '@', '!', '$', '\'', '(', ')', '*', ',' unescaped, but escapes '=' and '&'
        assertEquals("key%3Dvalue", LLURI.escapeQueryVariable("key=value"))
    }

    @Test
    fun testEscapingUTF8MultiByteCharacters() {
        // 2-byte UTF-8 character (ä -> U+00E4 -> %C3%A4)
        assertEquals("%C3%A4", LLURI.escape("ä"))

        // 3-byte UTF-8 character (日 -> U+65E5 -> %E6%97%A5)
        assertEquals("%E6%97%A5", LLURI.escape("日"))

        // 4-byte UTF-8 surrogate pair (😀 -> U+1F600 -> %F0%9F%98%80)
        assertEquals("%F0%9F%98%80", LLURI.escape("😀"))

        // Mixed clean prefix and multi-byte UTF-8 characters
        val input = "avatar_name_ä_😀"
        assertEquals("avatar_name_%C3%A4_%F0%9F%98%80", LLURI.escape(input))
    }

    @Test
    fun testCustomAllowedSet() {
        val customAllowed = "abc"
        assertEquals("abc%31%32%33", LLURI.escapeWithAllowed("abc123", customAllowed))

        val cleanCustom = "abc"
        assertSame(cleanCustom, LLURI.escapeWithAllowed(cleanCustom, customAllowed))

        // Custom allowed with non-ASCII character
        val result = LLURI.escapeWithAllowed("äö", "ä")
        assertEquals("ä%C3%B6", result)
    }

    @Test
    fun testRoundtripUnescapeASCII() {
        val original = "hello world & key=value"
        val escaped = LLURI.escape(original)
        val unescaped = LLURI.unescape(escaped)
        assertEquals(original, unescaped)
    }

    @Test
    fun testURIParserAndBuildHTTP() {
        val uriStr = "http://example.com:8080/path/to/resource?key1=val1&key2=val2"
        val uri = LLURI.fromString(uriStr)

        assertEquals("http", uri.scheme)
        assertEquals("example.com:8080", uri.authority)
        assertEquals("/path/to/resource", uri.path)
        assertEquals("key1=val1&key2=val2", uri.query)
        assertEquals("example.com", uri.hostName)
        assertEquals(8080, uri.hostPort)
        assertTrue(uri.isValid())

        val queryMap = uri.queryMap()
        assertEquals("val1", queryMap["key1"])
        assertEquals("val2", queryMap["key2"])

        val built = LLURI.buildHTTP("example.com", 8080, "/path/to/resource", "key1=val1&key2=val2")
        assertEquals(uriStr, built.asString())
    }
}
