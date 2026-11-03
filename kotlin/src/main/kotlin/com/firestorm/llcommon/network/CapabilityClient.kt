package com.firestorm.llcommon.network

import com.firestorm.llcommon.LLSD
import com.firestorm.llcommon.LLSDSerialize
import java.net.HttpURLConnection
import java.net.URL

data class EventQueueEvent(
    val eventName: String = "",
    val body: LLSD = LLSD.Undefined
)

class CapabilityClient {
    fun postLLSD(capabilityUrl: String, payload: LLSD): LLSD {
        val url = URL(capabilityUrl)
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/llsd+xml")
        conn.doOutput = true

        val xmlPayload = LLSDSerialize.toXML(payload)
        conn.outputStream.use { os ->
            os.write(xmlPayload.toByteArray(Charsets.UTF_8))
        }

        val responseCode = conn.responseCode
        if (responseCode !in 200..299) {
            throw RuntimeException("HTTP error $responseCode: ${conn.responseMessage}")
        }

        val responseBytes = conn.inputStream.use { it.readBytes() }
        return LLSDSerialize.parse(responseBytes)
    }

    fun pollEventQueue(eventQueueUrl: String, ack: Int = 0): List<EventQueueEvent> {
        val reqMap = LLSD.map(
            "ack" to LLSD.integer(ack),
            "done" to LLSD.bool(false)
        )

        val responseLlsd = postLLSD(eventQueueUrl, reqMap)
        val events = mutableListOf<EventQueueEvent>()

        if (responseLlsd is LLSD.LLSDMap && responseLlsd.has("events")) {
            val eventsArray = responseLlsd["events"]
            if (eventsArray is LLSD.LLSDArray) {
                for (evtItem in eventsArray.value) {
                    if (evtItem is LLSD.LLSDMap) {
                        events.add(
                            EventQueueEvent(
                                eventName = evtItem["message"].asString(),
                                body = evtItem["body"]
                            )
                        )
                    }
                }
            }
        }

        return events
    }
}

