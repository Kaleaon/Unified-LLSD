import { LLSD, LLSDType } from './llsd.js';
import { LLSDSerialize } from './llsd_serialize.js';

export interface EventQueueEvent {
  eventName: string;
  body: LLSD;
}

export class CapabilityClient {
  async postLLSD(capabilityUrl: string, payload: LLSD): Promise<LLSD> {
    const xmlPayload = LLSDSerialize.toXML(payload, true);
    const response = await fetch(capabilityUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/llsd+xml',
      },
      body: xmlPayload,
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const responseBytes = new Uint8Array(await response.arrayBuffer());
    return LLSDSerialize.parse(responseBytes);
  }

  async pollEventQueue(eventQueueUrl: string, ack = 0): Promise<EventQueueEvent[]> {
    const reqMap = LLSD.emptyMap();
    reqMap.set('ack', new LLSD(ack));
    reqMap.set('done', new LLSD(false));

    const responseLlsd = await this.postLLSD(eventQueueUrl, reqMap);
    const events: EventQueueEvent[] = [];

    if (responseLlsd.type === LLSDType.Map) {
      const eventsArray = responseLlsd.get('events');
      if (eventsArray.type === LLSDType.Array) {
        let i = 0;
        while (true) {
          const evtItem = eventsArray.get(i++);
          if (evtItem.isUndefined) break;
          if (evtItem.type === LLSDType.Map) {
            events.push({
              eventName: evtItem.get('message').asString(),
              body: evtItem.get('body'),
            });
          }
        }
      }
    }

    return events;
  }
}
