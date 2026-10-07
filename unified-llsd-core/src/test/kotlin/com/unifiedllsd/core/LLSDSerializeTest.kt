package com.unifiedllsd.core

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class LLSDSerializeTest {

    @Test
    fun testAllDataTypesSerializationAndParsing() {
        val uuidVal = LLUUID.generate()
        val dateVal = LLDate.now()
        val uriVal = LLURI.fromString("https://example.com/api?user=test")
        val binVal = byteArrayOf(0x01, 0x02, 0x03, 0x04, 0x05)

        val mapData = LLSD.map(
            "undefKey" to LLSD.Undefined,
            "boolKey" to LLSD.bool(true),
            "intKey" to LLSD.integer(42),
            "realKey" to LLSD.real(3.14159),
            "strKey" to LLSD.string("Hello World"),
            "uuidKey" to LLSD.uuid(uuidVal),
            "dateKey" to LLSD.of(dateVal),
            "uriKey" to LLSD.of(uriVal),
            "binKey" to LLSD.of(binVal),
            "arrayKey" to LLSD.array(LLSD.integer(1), LLSD.string("item"))
        )

        // XML
        val xmlStr = LLSDSerialize.toXML(mapData)
        val xmlParsed = LLSDSerialize.fromXML(xmlStr)
        assertTrue(xmlParsed.isMap)
        assertEquals(true, xmlParsed["boolKey"].asBoolean())
        assertEquals(42, xmlParsed["intKey"].asInt())
        assertEquals(3.14159, xmlParsed["realKey"].asReal(), 0.0001)
        assertEquals("Hello World", xmlParsed["strKey"].asString())
        assertEquals(uuidVal, xmlParsed["uuidKey"].asUUID())

        // Notation
        val notationStr = LLSDSerialize.toNotation(mapData)
        val notationParsed = LLSDSerialize.fromNotation(notationStr)
        assertTrue(notationParsed.isMap)
        assertEquals(42, notationParsed["intKey"].asInt())
        assertEquals("Hello World", notationParsed["strKey"].asString())
        assertEquals(uuidVal, notationParsed["uuidKey"].asUUID())

        // Binary
        val binBytes = LLSDSerialize.toBinary(mapData)
        val binParsed = LLSDSerialize.fromBinary(binBytes)
        assertTrue(binParsed.isMap)
        assertEquals(42, binParsed["intKey"].asInt())
        assertEquals("Hello World", binParsed["strKey"].asString())
        assertEquals(uuidVal, binParsed["uuidKey"].asUUID())
        assertArrayEquals(binVal, binParsed["binKey"].asBinary())

        // JSON
        val jsonStr = LLSDSerialize.toJSON(mapData)
        val jsonParsed = LLSDSerialize.fromJSON(jsonStr)
        assertTrue(jsonParsed.isMap)
        assertEquals(42, jsonParsed["intKey"].asInt())
        assertEquals("Hello World", jsonParsed["strKey"].asString())

        // Auto-detect parse
        val binBytesWithHeader = LLSDSerialize.BINARY_HEADER.toByteArray(Charsets.UTF_8) + binBytes
        val autoBinary = LLSDSerialize.parse(binBytesWithHeader)
        assertEquals(42, autoBinary["intKey"].asInt())

        val autoXml = LLSDSerialize.parse(xmlStr.toByteArray(Charsets.UTF_8))
        assertEquals(42, autoXml["intKey"].asInt())
    }

    @Test
    fun testLegacyPackageBridgeCompatibility() {
        val firestormUUID = com.firestorm.llcommon.LLUUID.generate()
        assertNotNull(firestormUUID)

        val linkpointLLSD = app.linkpoint.core.llsd.LLSD.integer(100)
        assertEquals(100, linkpointLLSD.asInt())

        val lindenlabLLSD = lindenlab.llsd.LLSD.string("Linden")
        assertEquals("Linden", lindenlabLLSD.asString())

        val protocolLLSD = com.linkpoint.protocol.llsd.LLSD.bool(true)
        assertTrue(protocolLLSD.asBoolean())
    }
}
