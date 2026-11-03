import test from 'node:test';
import assert from 'node:assert';
import { LLSD } from '../llsd.js';
import { LLDate } from '../lldate.js';
import { LLSDSerialize } from '../llsd_serialize.js';
import { CapabilityClient } from '../capability_client.js';
import { EventQueueClient } from '../event_queue_client.js';

test('64-bit integer handling', () => {
  const bigInt = 9223372036854775807n;
  const sd = new LLSD(bigInt);
  assert.strictEqual(sd.asBigInt(), bigInt);
});

test('Binary date LE endianness', () => {
  const sd = new LLSD(new LLDate(123456789.0));
  const bin = LLSDSerialize.toBinary(sd);
  const back = LLSDSerialize.fromBinary(bin);
  assert.strictEqual(Math.abs(back.asDate().secondsSinceEpoch - 123456789.0) < 0.001, true);
});

test('Notation roundtrip', () => {
  const sd = new LLSD(42n);
  const notation = LLSDSerialize.toNotation(sd);
  assert.strictEqual(notation, 'i42');
  const back = LLSDSerialize.fromNotation(notation);
  assert.strictEqual(back.asBigInt(), 42n);
});

test('CapabilityClient Content-Type binary parsing and sequence ACK tracking', async () => {
  let capturedBody: any = null;
  const binData = LLSDSerialize.toBinary(new LLSD({ id: 101, events: [{ message: 'TestBinary', body: 'ok' }] }));

  const mockFetch: any = async (url: string, init: any) => {
    capturedBody = init.body;
    return {
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/llsd+binary']]),
      arrayBuffer: async () => binData.buffer.slice(binData.byteOffset, binData.byteOffset + binData.byteLength)
    };
  };

  const capClient = new CapabilityClient(mockFetch);
  const result = await capClient.pollEventQueue('https://example.com/eq', 50);

  assert.strictEqual(result.id, 101);
  assert.strictEqual(result.nextAck, 101);
  assert.strictEqual(result.events.length, 1);
  assert.strictEqual(result.events[0].message, 'TestBinary');
  assert.ok(capturedBody.includes('<key>ack</key><integer>50</integer>'));
});

test('EventQueueClient long-poll 502/504 timeout reset vs 500 backoff', async () => {
  let callCount = 0;
  const mockFetch: any = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        ok: false,
        status: 502,
        statusText: 'Bad Gateway'
      };
    }
    return {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    };
  };

  const capClient = new CapabilityClient(mockFetch);
  const eqClient = new EventQueueClient(capClient);
  eqClient.queueUrl = 'https://example.com/eq';
  eqClient.baseDelay = 1000;
  eqClient.currentDelay = 1000;

  // Call 1: HTTP 502 -> resets delay to baseDelay
  try {
    await eqClient.pollOnce();
  } catch (e) {
    // Expected error
  }
  assert.strictEqual(eqClient.currentDelay, 1000);

  // Call 2: HTTP 500 -> exponential backoff to 2000
  try {
    await eqClient.pollOnce();
  } catch (e) {
    // Expected error
  }
  assert.strictEqual(eqClient.currentDelay, 2000);
});
