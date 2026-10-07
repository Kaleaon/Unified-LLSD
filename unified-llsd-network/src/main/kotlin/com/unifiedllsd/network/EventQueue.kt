package com.unifiedllsd.network

import com.unifiedllsd.core.LLSD
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class EventQueueEvent(
    val eventName: String,
    val body: LLSD = LLSD.Undefined
)

class EventQueue {
    private val _events = MutableSharedFlow<EventQueueEvent>(replay = 1, extraBufferCapacity = 64)
    val events: SharedFlow<EventQueueEvent> = _events.asSharedFlow()

    private var pollJob: Job? = null
    var currentAck: Int = 0
        private set

    suspend fun dispatchEvent(event: EventQueueEvent) {
        _events.emit(event)
    }

    suspend fun pollOnce(capabilityClient: CapabilityClient, eventQueueUrl: String): List<EventQueueEvent> {
        val receivedEvents = capabilityClient.pollEventQueue(eventQueueUrl, ack = currentAck)
        if (receivedEvents.isNotEmpty()) {
            currentAck++
            for (event in receivedEvents) {
                _events.emit(event)
            }
        }
        return receivedEvents
    }

    fun startPolling(
        capabilityClient: CapabilityClient,
        eventQueueUrl: String,
        scope: CoroutineScope
    ): Job {
        pollJob?.cancel()
        val job = scope.launch {
            while (isActive) {
                try {
                    pollOnce(capabilityClient, eventQueueUrl)
                } catch (_: Exception) {
                    // Backoff on polling exception
                }
            }
        }
        pollJob = job
        return job
    }

    fun stopPolling() {
        pollJob?.cancel()
        pollJob = null
    }
}

typealias EventQueueDispatcher = EventQueue
