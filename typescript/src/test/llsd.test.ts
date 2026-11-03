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

test('Container Inspection API: asMap(), asArray(), size', () => {
  const mapData = new Map<string, LLSD>();
  mapData.set('a', new LLSD('valA'));
  mapData.set('b', new LLSD(100n));

  const mapSD = new LLSD(mapData);
  assert.strictEqual(mapSD.size, 2);
  assert.strictEqual(mapSD.asMap().get('a')?.asString(), 'valA');
  assert.strictEqual(mapSD.asArray().length, 0);

  const arrayData = [new LLSD('item1'), new LLSD('item2'), new LLSD('item3')];
  const arraySD = new LLSD(arrayData);
  assert.strictEqual(arraySD.size, 3);
  assert.strictEqual(arraySD.asArray().length, 3);
  assert.strictEqual(arraySD.asMap().size, 0);

  const scalarSD = new LLSD(42);
  assert.strictEqual(scalarSD.size, 0);
  assert.strictEqual(scalarSD.asMap().size, 0);
  assert.strictEqual(scalarSD.asArray().length, 0);
});

test('LLSDSerialize facade delegation & auto-detect parse', () => {
  const sd = new LLSD('Facade Test');

  // XML facade
  const xml = LLSDSerialize.toXML(sd);
  assert.strictEqual(xml.includes('<string>Facade Test</string>'), true);
  assert.strictEqual(LLSDSerialize.fromXML(xml).asString(), 'Facade Test');

  // Binary facade
  const bin = LLSDSerialize.toBinary(sd);
  assert.strictEqual(LLSDSerialize.fromBinary(bin).asString(), 'Facade Test');

  // Notation facade
  const notation = LLSDSerialize.toNotation(sd);
  assert.strictEqual(LLSDSerialize.fromNotation(notation).asString(), 'Facade Test');

  // Auto-detect parse
  assert.strictEqual(LLSDSerialize.parse(xml).asString(), 'Facade Test');
  assert.strictEqual(LLSDSerialize.parse(bin).asString(), 'Facade Test');
  assert.strictEqual(LLSDSerialize.parse(notation).asString(), 'Facade Test');
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
