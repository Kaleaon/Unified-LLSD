package com.firestorm.llcommon

class EventQueueClient(
    private val capabilityClient: CapabilityClient = CapabilityClient()
) {
    var queueUrl: String? = null
    var ackId: Int? = null
    var isPolling: Boolean = false
        private set

    var baseDelayMs: Long = 1000L
    var maxDelayMs: Long = 30000L
    var currentDelayMs: Long = 1000L
        private set

    private val eventListeners = mutableListOf<(EventQueueEvent) -> Unit>()

    fun addEventListener(listener: (EventQueueEvent) -> Unit) {
        eventListeners.add(listener)
    }

    fun pollOnce(): EventQueuePollResult? {
        val url = queueUrl ?: return null
        try {
            val result = capabilityClient.pollEventQueue(url, ackId)
            currentDelayMs = baseDelayMs
            if (result.id != null) {
                ackId = result.id
            }
            for (evt in result.events) {
                for (listener in eventListeners) {
                    try {
                        listener(evt)
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }
            }
            return result
        } catch (e: Exception) {
            val msg = e.message ?: ""
            if (msg.contains("502") || msg.contains("504") || msg.contains("timeout") || msg.contains("Timeout")) {
                // Benign long-poll timeout (HTTP 502/504) -> reset delay immediately to baseDelayMs without backoff
                currentDelayMs = baseDelayMs
            } else {
                // True network error or HTTP 500/503 -> exponential backoff
                currentDelayMs = minOf(currentDelayMs * 2, maxDelayMs)
            }
            throw e
        }
    }
}
