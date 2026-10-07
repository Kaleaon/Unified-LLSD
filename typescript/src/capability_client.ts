import { LLSDSerialize } from './llsd_serialize.js';

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

    const xmlPayload = LLSDSerialize.toXML(payload);
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

    if (responseLlsd && typeof responseLlsd === 'object') {
      if (typeof responseLlsd.id === 'number') {
        result.id = responseLlsd.id;
        result.nextAck = responseLlsd.id;
      }

      if (Array.isArray(responseLlsd.events)) {
        for (const item of responseLlsd.events) {
          if (item && typeof item === 'object') {
            result.events.push({
              message: item.message || '',
              body: item.body
            });
          }
        }
      }
    }

    return result;
  }
}
