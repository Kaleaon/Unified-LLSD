package com.unifiedllsd.network

import com.unifiedllsd.core.LLSD
import com.unifiedllsd.core.LLSDSerialize
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

/**
 * Helper client for Second Life capability requests and EventQueueGet polling.
 */
class CapabilityClient {

    /**
     * Request seed capability dictionary or request individual capabilities.
     */
    suspend fun postLLSD(capabilityUrl: String, payload: LLSD): LLSD = withContext(Dispatchers.IO) {
        require(capabilityUrl.isNotBlank()) { "Capability URL cannot be blank" }

        val xmlPayload = LLSDSerialize.toXML(payload, withDeclaration = true)
        val url = URL(capabilityUrl)
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            setRequestProperty("Content-Type", "application/llsd+xml")
            setRequestProperty("Accept", "application/llsd+xml, application/llsd+binary")
            connectTimeout = 10000
            readTimeout = 30000
        }

        connection.outputStream.use { out ->
            out.write(xmlPayload.toByteArray(Charsets.UTF_8))
        }

        val responseCode = connection.responseCode
        if (responseCode !in 200..299) {
            val errorMsg = runCatching { connection.errorStream?.bufferedReader()?.readText() }.getOrNull()
            throw IllegalStateException("HTTP POST to $capabilityUrl failed with status $responseCode: $errorMsg")
        }

        val responseBytes = connection.inputStream.use { it.readBytes() }
        if (responseBytes.isEmpty()) {
            return@withContext LLSD.Undefined
        }

        return@withContext LLSDSerialize.parse(responseBytes)
    }

    /**
     * Polls EventQueueGet capability and parses array of events.
     */
    suspend fun pollEventQueue(eventQueueUrl: String, ack: Int = 0): List<EventQueueEvent> {
        val reqMap = mapOf(
            "ack" to LLSD.fromInteger(ack),
            "done" to LLSD.fromBoolean(false)
        )

        val responseLlsd = postLLSD(eventQueueUrl, LLSD.fromMap(reqMap))
        val events = mutableListOf<EventQueueEvent>()

        if (responseLlsd.isMap && responseLlsd.has("events")) {
            val eventsArray = responseLlsd["events"].asArray()
            for (evtItem in eventsArray) {
                if (evtItem.isMap) {
                    events.add(
                        EventQueueEvent(
                            eventName = evtItem["message"].asString(),
                            body = evtItem["body"]
                        )
                    )
                }
            }
        }

        return events
    }
}
