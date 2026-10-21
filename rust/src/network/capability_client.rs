use crate::Llsd;
use crate::serialize;

#[derive(Debug, Clone, PartialEq)]
pub struct EventQueueEvent {
    pub event_name: String,
    pub body: Llsd,
}

pub struct CapabilityClient;

impl CapabilityClient {
    pub fn new() -> Self {
        Self
    }

    pub fn format_capability_request(payload: &Llsd) -> String {
        serialize::to_xml(payload, true)
    }

    pub fn parse_event_queue_response(response_llsd: &Llsd) -> Vec<EventQueueEvent> {
        let mut events = Vec::new();
        if let Llsd::Map(map) = response_llsd {
            if let Some(Llsd::Array(evt_list)) = map.get("events") {
                for evt in evt_list {
                    if let Llsd::Map(evt_map) = evt {
                        let event_name = match evt_map.get("message") {
                            Some(Llsd::String(s)) => s.clone(),
                            _ => String::new(),
                        };
                        let body = evt_map.get("body").cloned().unwrap_or(Llsd::Undefined);
                        events.push(EventQueueEvent { event_name, body });
                    }
                }
            }
        }
        events
    }
}
