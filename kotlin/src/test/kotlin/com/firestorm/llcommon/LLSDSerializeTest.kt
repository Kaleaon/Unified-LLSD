package com.firestorm.llcommon

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Spec-conformance tests for [LLSDSerialize].
 *
 * Cross-checked against the canonical reference implementations:
 *  - python-llsd (Linden Lab)
 *  - Libremetaverse / OpenMetaverse OSD
 */
class LLSDSerializeXmlTest {

    @Test fun roundTripScalarsAndContainers() {
        val sd = LLSD.map(
            "i" to LLSD.integer(42),
            "r" to LLSD.real(3.5),
            "b" to LLSD.bool(true),
            "s" to LLSD.string("hello"),
            "u" to LLSD.uuid(LLUUID.NULL),
            "arr" to LLSD.array(LLSD.integer(1), LLSD.integer(2), LLSD.integer(3)),
        )
        val xml = LLSDSerialize.toXML(sd)
        val back = LLSDSerialize.fromXML(xml)
        assertEquals(sd["i"].asInt(), back["i"].asInt())
        assertEquals(sd["r"].asReal(), back["r"].asReal())
        assertEquals(sd["b"].asBoolean(), back["b"].asBoolean())
        assertEquals(sd["s"].asString(), back["s"].asString())
        assertEquals(3, back["arr"].size())
        assertEquals(2, back["arr"][1].asInt())
    }

    @Test fun binaryEncodingAttributeIsBase64() {
        val sd = LLSD.of(byteArrayOf(0x01, 0x02, 0x03))
        val xml = LLSDSerialize.toXML(sd)
        assertTrue(xml.contains("encoding=\"base64\""), "expected base64 attr, got: $xml")
    }

    @Test fun binaryReadHonorsBase16Encoding() {
        val xml = "<llsd><binary encoding=\"base16\">deadBEEF</binary></llsd>"
        val sd = LLSDSerialize.fromXML(xml)
        assertTrue(sd is LLSD.LLSDBinary)
        val expected = byteArrayOf(0xde.toByte(), 0xad.toByte(), 0xbe.toByte(), 0xef.toByte())
        assertTrue(expected.contentEquals(sd.value))
    }

    @Test fun binaryReadDefaultsToBase64WhenNoAttribute() {
        val xml = "<llsd><binary>AQID</binary></llsd>"
        val sd = LLSDSerialize.fromXML(xml)
        assertTrue(sd is LLSD.LLSDBinary)
        assertTrue(byteArrayOf(1, 2, 3).contentEquals(sd.value))
    }

    @Test fun binaryReadRejectsBase85() {
        val xml = "<llsd><binary encoding=\"base85\">whatever</binary></llsd>"
        assertFailsWith<IllegalArgumentException> { LLSDSerialize.fromXML(xml) }
    }

    @Test fun realSpecialFloatsUseLlsdSpelling() {
        assertTrue(LLSDSerialize.toXML(LLSD.real(Double.NaN)).contains(">nan<"))
        assertTrue(LLSDSerialize.toXML(LLSD.real(Double.POSITIVE_INFINITY)).contains(">inf<"))
        assertTrue(LLSDSerialize.toXML(LLSD.real(Double.NEGATIVE_INFINITY)).contains(">-inf<"))
    }

    @Test fun realSpecialFloatsRoundTrip() {
        for (v in listOf(Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY)) {
            val xml = LLSDSerialize.toXML(LLSD.real(v))
            val back = LLSDSerialize.fromXML(xml).asReal()
            if (v.isNaN()) assertTrue(back.isNaN()) else assertEquals(v, back)
        }
    }

    @Test fun booleanReaderAcceptsCanonicalSpellings() {
        for (truthy in listOf("true", "TRUE", "True", "1", "1.0", "t")) {
            val xml = "<llsd><boolean>$truthy</boolean></llsd>"
            assertTrue(LLSDSerialize.fromXML(xml).asBoolean(), "expected true for '$truthy'")
        }
        for (falsy in listOf("false", "FALSE", "0", "")) {
            val xml = "<llsd><boolean>$falsy</boolean></llsd>"
            assertEquals(false, LLSDSerialize.fromXML(xml).asBoolean(), "expected false for '$falsy'")
        }
    }

    @Test fun stringPreservesWhitespace() {
        val sd = LLSD.string("  hello  world\n")
        val back = LLSDSerialize.fromXML(LLSDSerialize.toXML(sd))
        assertEquals("  hello  world\n", back.asString())
    }

    @Test fun toXMLDocumentIncludesDeclaration() {
        val xml = LLSDSerialize.toXMLDocument(LLSD.integer(1))
        assertTrue(xml.startsWith("<?xml"), "expected declaration prefix, got: $xml")
    }

    @Test fun toXMLDoesNotIncludeDeclarationByDefault() {
        val xml = LLSDSerialize.toXML(LLSD.integer(1))
        assertTrue(!xml.startsWith("<?xml"), "default toXML should not emit declaration: $xml")
    }
}

class LLSDSerializeNotationTest {

    @Test fun uuidIsBareNotQuoted() {
        val id = LLUUID.fromString("3c115e51-04f4-523c-9fa6-98aff1034730")!!
        val notation = LLSDSerialize.toNotation(LLSD.uuid(id))
        assertEquals("u3c115e51-04f4-523c-9fa6-98aff1034730", notation)
        val back = LLSDSerialize.fromNotation(notation).asUUID()
        assertEquals(id, back)
    }

    @Test fun booleanShortcutsAccepted() {
        assertEquals(true, LLSDSerialize.fromNotation("1").asBoolean())
        assertEquals(false, LLSDSerialize.fromNotation("0").asBoolean())
        assertEquals(true, LLSDSerialize.fromNotation("t").asBoolean())
        assertEquals(false, LLSDSerialize.fromNotation("F").asBoolean())
        assertEquals(true, LLSDSerialize.fromNotation("TRUE").asBoolean())
    }

    @Test fun base64BinaryRoundTrip() {
        val data = byteArrayOf(0x01, 0x02, 0x03, 0x7f, 0x00.toByte())
        val notation = LLSDSerialize.toNotation(LLSD.of(data))
        assertTrue(notation.startsWith("b64\""))
        val back = LLSDSerialize.fromNotation(notation)
        assertTrue(back is LLSD.LLSDBinary)
        assertTrue(data.contentEquals(back.value))
    }

    @Test fun base16BinaryParsed() {
        val sd = LLSDSerialize.fromNotation("b16\"deadBEEF\"")
        assertTrue(sd is LLSD.LLSDBinary)
        val expected = byteArrayOf(0xde.toByte(), 0xad.toByte(), 0xbe.toByte(), 0xef.toByte())
        assertTrue(expected.contentEquals(sd.value))
    }

    @Test fun sizedRawBinaryParsed() {
        val sd = LLSDSerialize.fromNotation("b(3)\"\"")
        assertTrue(sd is LLSD.LLSDBinary)
        assertEquals(3, sd.value.size)
        assertEquals(0x01.toByte(), sd.value[0])
        assertEquals(0x03.toByte(), sd.value[2])
    }

    @Test fun sizedRawStringParsed() {
        val sd = LLSDSerialize.fromNotation("s(5)\"hello\"")
        assertEquals("hello", sd.asString())
    }

    @Test fun mapAndArrayRoundTrip() {
        val sd = LLSD.map(
            "name" to LLSD.string("alice"),
            "age" to LLSD.integer(30),
            "tags" to LLSD.array(LLSD.string("a"), LLSD.string("b")),
        )
        val notation = LLSDSerialize.toNotation(sd)
        val back = LLSDSerialize.fromNotation(notation)
        assertEquals("alice", back["name"].asString())
        assertEquals(30, back["age"].asInt())
        assertEquals(2, back["tags"].size())
        assertEquals("b", back["tags"][1].asString())
    }

    @Test fun stringEscapeRoundTrip() {
        val sd = LLSD.string("it's a \\test")
        val notation = LLSDSerialize.toNotation(sd)
        assertEquals("it's a \\test", LLSDSerialize.fromNotation(notation).asString())
    }

    @Test fun headerCookieIsStripped() {
        val payload = LLSDSerialize.NOTATION_HEADER + "i42"
        assertEquals(42, LLSDSerialize.fromNotation(payload).asInt())
    }

    @Test fun undefinedAndRealAndDate() {
        assertTrue(LLSDSerialize.fromNotation("!").isUndefined())
        assertEquals(2.5, LLSDSerialize.fromNotation("r2.5").asReal())
        val date = LLDate(1234567.5)
        val notation = LLSDSerialize.toNotation(LLSD.of(date))
        assertTrue(notation.startsWith("d\""))
        assertEquals(1234567.5, LLSDSerialize.fromNotation(notation).asDate().secondsSinceEpoch)
    }
}

class LLSDSerializeBinaryTest {

    @Test fun booleanWritesSingleByte() {
        assertTrue(byteArrayOf('1'.code.toByte()).contentEquals(LLSDSerialize.toBinary(LLSD.bool(true))))
        assertTrue(byteArrayOf('0'.code.toByte()).contentEquals(LLSDSerialize.toBinary(LLSD.bool(false))))
    }

    @Test fun booleanRoundTrip() {
        assertEquals(true, LLSDSerialize.fromBinary(LLSDSerialize.toBinary(LLSD.bool(true))).asBoolean())
        assertEquals(false, LLSDSerialize.fromBinary(LLSDSerialize.toBinary(LLSD.bool(false))).asBoolean())
    }

    @Test fun integerIsBigEndianFourBytes() {
        val out = LLSDSerialize.toBinary(LLSD.integer(0x01020304))
        assertEquals(5, out.size)
        assertEquals('i'.code.toByte(), out[0])
        assertEquals(0x01.toByte(), out[1])
        assertEquals(0x02.toByte(), out[2])
        assertEquals(0x03.toByte(), out[3])
        assertEquals(0x04.toByte(), out[4])
    }

    @Test fun realIsBigEndianEightBytes() {
        val out = LLSDSerialize.toBinary(LLSD.real(1.0))
        assertEquals(9, out.size)
        assertEquals('r'.code.toByte(), out[0])
        // IEEE-754 double 1.0 big-endian: 3F F0 00 00 00 00 00 00
        assertEquals(0x3F.toByte(), out[1])
        assertEquals(0xF0.toByte(), out[2])
    }

    @Test fun dateIsLittleEndianEightBytes() {
        val out = LLSDSerialize.toBinary(LLSD.of(LLDate(1.0)))
        assertEquals(9, out.size)
        assertEquals('d'.code.toByte(), out[0])
        // IEEE-754 double 1.0 little-endian: 00 00 00 00 00 00 F0 3F
        assertEquals(0x00.toByte(), out[1])
        assertEquals(0x00.toByte(), out[2])
        assertEquals(0xF0.toByte(), out[7])
        assertEquals(0x3F.toByte(), out[8])
        val back = LLSDSerialize.fromBinary(out).asDate()
        assertEquals(1.0, back.secondsSinceEpoch)
    }

    @Test fun stringRoundTrip() {
        val sd = LLSD.string("héllo, 世界")
        val back = LLSDSerialize.fromBinary(LLSDSerialize.toBinary(sd))
        assertEquals(sd.asString(), back.asString())
    }

    @Test fun uuidRoundTrip() {
        val id = LLUUID.fromString("550e8400-e29b-41d4-a716-446655440000")!!
        val back = LLSDSerialize.fromBinary(LLSDSerialize.toBinary(LLSD.uuid(id))).asUUID()
        assertEquals(id, back)
    }

    @Test fun binaryRoundTrip() {
        val data = ByteArray(256) { it.toByte() }
        val sd = LLSD.of(data)
        val back = LLSDSerialize.fromBinary(LLSDSerialize.toBinary(sd))
        assertTrue(back is LLSD.LLSDBinary)
        assertTrue(data.contentEquals(back.value))
    }

    @Test fun mapPreservesInsertionOrderInNonCanonical() {
        val sd = LLSD.LLSDMap(linkedMapOf(
            "z" to LLSD.integer(1),
            "a" to LLSD.integer(2),
            "m" to LLSD.integer(3),
        ))
        val out = LLSDSerialize.toBinary(sd)
        val back = LLSDSerialize.fromBinary(out)
        assertTrue(back is LLSD.LLSDMap)
        assertEquals(listOf("z", "a", "m"), back.value.keys.toList())
    }

    @Test fun canonicalBinarySortsKeys() {
        val sd = LLSD.LLSDMap(linkedMapOf(
            "z" to LLSD.integer(1),
            "a" to LLSD.integer(2),
        ))
        val canonical = LLSDSerialize.toCanonicalBinary(sd)
        val back = LLSDSerialize.fromBinary(canonical)
        assertTrue(back is LLSD.LLSDMap)
        assertEquals(listOf("a", "z"), back.value.keys.toList())
    }

    @Test fun arrayRoundTrip() {
        val sd = LLSD.array(LLSD.integer(1), LLSD.string("two"), LLSD.bool(true))
        val back = LLSDSerialize.fromBinary(LLSDSerialize.toBinary(sd))
        assertEquals(3, back.size())
        assertEquals(1, back[0].asInt())
        assertEquals("two", back[1].asString())
        assertEquals(true, back[2].asBoolean())
    }

    @Test fun rejectsCorruptMapKeyTag() {
        // Manually crafted: '{' count=1, then bad tag 'x' instead of 'k'
        val bad = byteArrayOf('{'.code.toByte(), 0, 0, 0, 1, 'x'.code.toByte())
        assertFailsWith<IllegalArgumentException> { LLSDSerialize.fromBinary(bad) }
    }

    @Test fun toleratesBinaryHeaderCookie() {
        val out = LLSDSerialize.BINARY_HEADER.toByteArray(Charsets.US_ASCII) +
                LLSDSerialize.toBinary(LLSD.integer(7))
        assertEquals(7, LLSDSerialize.fromBinary(out).asInt())
    }
}

class LLSDSerializeAutoDetectTest {

    @Test fun detectsXmlByDeclaration() {
        val data = ("<?xml version=\"1.0\"?><llsd><integer>1</integer></llsd>").toByteArray()
        assertEquals(LLSDSerialize.Format.XML, LLSDSerialize.detectFormat(data))
        assertEquals(1, LLSDSerialize.parse(data).asInt())
    }

    @Test fun detectsBinaryByCookie() {
        val data = LLSDSerialize.BINARY_HEADER.toByteArray() +
                LLSDSerialize.toBinary(LLSD.string("hi"))
        assertEquals(LLSDSerialize.Format.BINARY, LLSDSerialize.detectFormat(data))
        assertEquals("hi", LLSDSerialize.parse(data).asString())
    }

    @Test fun detectsNotationByCookie() {
        val data = (LLSDSerialize.NOTATION_HEADER + "i9").toByteArray()
        assertEquals(LLSDSerialize.Format.NOTATION, LLSDSerialize.detectFormat(data))
        assertEquals(9, LLSDSerialize.parse(data).asInt())
    }

    @Test fun detectsLlsdRootWithoutDeclaration() {
        val data = "<llsd><integer>1</integer></llsd>".toByteArray()
        assertEquals(LLSDSerialize.Format.XML, LLSDSerialize.detectFormat(data))
    }
}

class LLSDSerializeJsonTest {

    @Test fun roundTrip() {
        val sd = LLSD.map(
            "n" to LLSD.integer(42),
            "s" to LLSD.string("alice\n\"bob\""),
            "a" to LLSD.array(LLSD.bool(true), LLSD.real(1.5)),
        )
        val json = LLSDSerialize.toJSON(sd)
        val back = LLSDSerialize.fromJSON(json)
        assertEquals(42, back["n"].asInt())
        assertEquals("alice\n\"bob\"", back["s"].asString())
        assertEquals(true, back["a"][0].asBoolean())
        assertEquals(1.5, back["a"][1].asReal())
    }

    @Test fun nonFiniteRealsBecomeNull() {
        assertEquals("null", LLSDSerialize.toJSON(LLSD.real(Double.NaN)))
        assertEquals("null", LLSDSerialize.toJSON(LLSD.real(Double.POSITIVE_INFINITY)))
    }

    @Test fun unicodeEscapeSupported() {
        val sd = LLSDSerialize.fromJSON("\"\\u00e9\"")
        assertEquals("é", sd.asString())
    }
}
