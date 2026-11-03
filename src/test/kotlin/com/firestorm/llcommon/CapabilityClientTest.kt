package com.firestorm.llcommon

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertFailsWith

class CapabilityClientTest {

    @Test
    fun testPollEventQueueSequenceTrackingAndBinaryParsing() {
        val testMap = LLSD.map(
            "id" to LLSD.integer(777),
            "events" to LLSD.array(
                LLSD.map(
                    "message" to LLSD.string("ChatterBoxSessionStartReply"),
                    "body" to LLSD.string("success")
                )
            )
        )
        val binaryBytes = LLSDSerialize.toBinary(testMap)

        var lastPostData: String? = null
        val mockTransport = { url: String, postData: ByteArray, contentType: String ->
            lastPostData = String(postData, Charsets.UTF_8)
            Pair(200, Pair("application/llsd+binary", binaryBytes))
        }

        val client = CapabilityClient(mockTransport)
        val result = client.pollEventQueue("https://example.com/eq", ack = 123)

        assertNotNull(lastPostData)
        assertEquals(true, lastPostData!!.contains("<key>ack</key><integer>123</integer>"))
        assertEquals(777, result.id)
        assertEquals(777, result.nextAck)
        assertEquals(1, result.events.size)
        assertEquals("ChatterBoxSessionStartReply", result.events[0].eventName)
    }

    @Test
    fun testEventQueueClientTimeoutResetVsBackoff() {
        var callCount = 0
        val mockTransport = { url: String, postData: ByteArray, contentType: String ->
            callCount++
            if (callCount == 1) {
                Pair(502, Pair("text/plain", "Bad Gateway 502".toByteArray()))
            } else {
                Pair(500, Pair("text/plain", "Internal Server Error 500".toByteArray()))
            }
        }

        val capClient = CapabilityClient(mockTransport)
        val eqClient = EventQueueClient(capClient)
        eqClient.queueUrl = "https://example.com/eq"
        eqClient.baseDelayMs = 1000L

        // Call 1: HTTP 502 -> reset delay immediately to baseDelayMs
        assertFailsWith<RuntimeException> { eqClient.pollOnce() }
        assertEquals(1000L, eqClient.currentDelayMs)

        // Call 2: HTTP 500 -> exponential backoff to 2000L
        assertFailsWith<RuntimeException> { eqClient.pollOnce() }
        assertEquals(2000L, eqClient.currentDelayMs)
    }
}
