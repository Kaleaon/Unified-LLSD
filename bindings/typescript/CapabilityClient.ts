import { LLSDSerialize } from './LLSDSerialize.js';
import { LLSDValue } from './LLSD.js';

export interface EventQueueEvent {
  message: string;
  body: any;
}

export interface EventQueuePollResult {
  events: EventQueueEvent[];
  id?: number;
  nextAck?: number;
}

export class CapabilityClient {
  constructor(private fetchImpl: typeof fetch = globalThis.fetch) {}

  async postLLSD(capabilityUrl: string, payload: any): Promise<any> {
    if (!capabilityUrl) throw new Error('Capability URL is required');

    const llsdPayload = payload instanceof LLSDValue ? payload : LLSDValue.fromJSObject(payload);
    const xmlPayload = LLSDSerialize.toXML(llsdPayload);
    const response = await this.fetchImpl(capabilityUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/llsd+xml' },
      body: xmlPayload
    });

    if (!response.ok) {
      const err: any = new Error(`HTTP ${response.status} ${response.statusText}`);
      err.status = response.status;
      throw err;
    }

    const contentType = (response.headers?.get('content-type') || '').toLowerCase();

    if (contentType.includes('application/llsd+binary')) {
      const buffer = new Uint8Array(await response.arrayBuffer());
      return LLSDSerialize.fromBinary(buffer);
    } else if (contentType.includes('application/llsd+notation') || contentType.includes('text/plain')) {
      const text = await response.text();
      return LLSDSerialize.fromNotation(text);
    } else if (contentType.includes('application/llsd+xml') || contentType.includes('text/xml') || contentType.includes('application/xml')) {
      const text = await response.text();
      return LLSDSerialize.fromXML(text);
    } else {
      const text = await response.text();
      return LLSDSerialize.parse(text);
    }
  }

  async pollEventQueue(eventQueueUrl: string, ack?: number | null): Promise<EventQueuePollResult> {
    const reqBody: any = { done: false };
    if (ack !== undefined && ack !== null) {
      reqBody.ack = ack;
    }

    const responseLlsd = await this.postLLSD(eventQueueUrl, reqBody);

    const result: EventQueuePollResult = { events: [] };

    if (responseLlsd) {
      let idVal: any;
      let eventsArr: any[] = [];

      if (typeof responseLlsd.get === 'function') {
        const idNode = responseLlsd.get('id');
        if (idNode && !idNode.isUndefined()) {
          idVal = idNode.asInteger();
        }
        const eventsNode = responseLlsd.get('events');
        if (eventsNode && !eventsNode.isUndefined()) {
          eventsArr = eventsNode.asArray;
        }
      } else if (typeof responseLlsd === 'object') {
        idVal = responseLlsd.id;
        eventsArr = Array.isArray(responseLlsd.events) ? responseLlsd.events : [];
      }

      if (typeof idVal === 'number' && !isNaN(idVal)) {
        result.id = idVal;
        result.nextAck = idVal;
      }

      for (const item of eventsArr) {
        if (!item) continue;
        if (typeof item.get === 'function') {
          const msgNode = item.get('message');
          const bodyNode = item.get('body');
          result.events.push({
            message: msgNode && !msgNode.isUndefined() ? msgNode.asString() : '',
            body: bodyNode && !bodyNode.isUndefined() ? bodyNode.asString() : undefined
          });
        } else if (typeof item === 'object') {
          result.events.push({
            message: item.message || '',
            body: item.body
          });
        }
      }
    }

    return result;
  }
}
