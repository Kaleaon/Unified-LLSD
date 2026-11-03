package com.unifiedllsd.network

import com.unifiedllsd.core.LLSD
import com.unifiedllsd.core.LLSDSerialize
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

data class EventQueueEvent(
    val eventName: String,
    val body: LLSD = LLSD.Undefined
)

data class EventQueuePollResult(
    val events: List<EventQueueEvent> = emptyList(),
    val id: Int? = null,
    val nextAck: Int? = id
)

/**
 * Helper client for Second Life capability requests and EventQueueGet polling.
 */
class CapabilityClient(
    private val httpTransport: ((url: String, postData: ByteArray, contentType: String) -> Pair<Int, Pair<String, ByteArray>>)? = null
) {
    /**
     * Request seed capability dictionary or request individual capabilities.
     */
    fun postLLSD(capabilityUrl: String, payload: LLSD): Pair<Int, LLSD> {
        val xmlPayload = LLSDSerialize.toXML(payload, withDeclaration = true)
        val requestBytes = xmlPayload.toByteArray(Charsets.UTF_8)

        val (statusCode, response) = if (httpTransport != null) {
            httpTransport.invoke(capabilityUrl, requestBytes, "application/llsd+xml")
        } else {
            val url = URL(capabilityUrl)
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                setRequestProperty("Content-Type", "application/llsd+xml")
                setRequestProperty("Accept", "application/llsd+xml, application/llsd+binary, application/llsd+notation")
                connectTimeout = 10000
                readTimeout = 30000
            }
            conn.outputStream.use { it.write(requestBytes) }
            val code = conn.responseCode
            val contentType = conn.contentType ?: ""
            val stream: InputStream = if (code in 200..299) conn.inputStream else conn.errorStream ?: InputStream.nullInputStream()
            val bytes = stream.readBytes()
            Pair(code, Pair(contentType, bytes))
        }

        val (contentType, responseBytes) = response
        if (statusCode !in 200..299) {
            val errMessage = if (responseBytes.isNotEmpty()) String(responseBytes, Charsets.UTF_8) else "HTTP $statusCode"
            throw RuntimeException("HTTP $statusCode: $errMessage")
        }

        val lowerContentType = contentType.lowercase()
        val parsed = when {
            lowerContentType.contains("application/llsd+binary") -> LLSDSerialize.fromBinary(responseBytes)
            lowerContentType.contains("application/llsd+notation") || lowerContentType.contains("text/plain") -> LLSDSerialize.fromNotation(String(responseBytes, Charsets.UTF_8))
            lowerContentType.contains("application/llsd+xml") || lowerContentType.contains("text/xml") || lowerContentType.contains("application/xml") -> LLSDSerialize.fromXML(String(responseBytes, Charsets.UTF_8))
            else -> LLSDSerialize.parse(responseBytes)
        }

        return Pair(statusCode, parsed)
    }

    suspend fun postLLSDAsync(capabilityUrl: String, payload: LLSD): LLSD = withContext(Dispatchers.IO) {
        postLLSD(capabilityUrl, payload).second
    }

    /**
     * Polls EventQueueGet capability and parses array of events.
     */
    fun pollEventQueue(eventQueueUrl: String, ack: Int? = null): EventQueuePollResult {
        val pairs = mutableListOf<Pair<String, LLSD>>(
            "done" to LLSD.bool(false)
        )
        if (ack != null) {
            pairs.add("ack" to LLSD.integer(ack))
        }

        val (_, responseLlsd) = postLLSD(eventQueueUrl, LLSD.map(*pairs.toTypedArray()))

        val events = mutableListOf<EventQueueEvent>()
        var id: Int? = null

        if (responseLlsd is LLSD.LLSDMap) {
            val idNode = responseLlsd["id"]
            if (idNode is LLSD.LLSDInteger) {
                id = idNode.asInt()
            }

            val eventsNode = responseLlsd["events"]
            if (eventsNode is LLSD.LLSDArray) {
                for (i in 0 until eventsNode.size()) {
                    val item = eventsNode[i]
                    if (item is LLSD.LLSDMap) {
                        val name = item["message"].asString()
                        val body = item["body"]
                        events.add(EventQueueEvent(name, body))
                    }
                }
            }
        }

        return EventQueuePollResult(events = events, id = id)
    }

    suspend fun pollEventQueueAsync(eventQueueUrl: String, ack: Int? = null): EventQueuePollResult = withContext(Dispatchers.IO) {
        pollEventQueue(eventQueueUrl, ack)
    }
}
