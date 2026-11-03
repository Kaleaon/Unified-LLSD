import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LLSD,
  LLSDValue,
  LLSDSerialize,
  LLSDDate,
  LLDate,
  LLUUID,
  Vector2,
  Vector3,
  JointInfluence,
  GLTFMaterialAdapter,
  MeshBlockAdapter,
  TextureTransformAdapter,
  DetailLevel,
  CapabilityClient,
  EventQueueClient
} from '../index.js';

test('64-bit integer handling', () => {
  const bigInt = 9223372036854775807n;
  const sd = LLSDValue.integer(bigInt);
  assert.equal(sd.asBigInt(), bigInt);
});

test('Binary date LE endianness', () => {
  const sd = LLSDValue.date(new LLSDDate(123456789.0));
  const bin = LLSDSerialize.toBinary(sd);
  const back = LLSDSerialize.fromBinary(bin);
  assert.ok(Math.abs(back.asDate().secondsSinceEpoch - 123456789.0) < 0.001);
});

test('Notation roundtrip', () => {
  const sd = LLSDValue.integer(42n);
  const notation = LLSDSerialize.toNotation(sd);
  assert.equal(notation, 'i42');
  const back = LLSDSerialize.fromNotation(notation);
  assert.equal(back.asBigInt(), 42n);
});

test('XML roundtrip and auto-detect', () => {
  const mapVal = LLSDValue.map({
    bool_true: LLSDValue.boolean(true),
    int_val: LLSDValue.integer(100),
    string_val: LLSDValue.string('hello & world')
  });

  const xmlStr = LLSDSerialize.toXML(mapVal);
  const parsed = LLSDSerialize.parse(xmlStr);
  assert.equal(parsed.get('bool_true').asBoolean(), true);
  assert.equal(parsed.get('int_val').asInteger(), 100);
  assert.equal(parsed.get('string_val').asString(), 'hello & world');
});

test('JSON roundtrip', () => {
  const original = LLSDValue.map({
    key1: LLSDValue.string('value1'),
    key2: LLSDValue.integer(123)
  });
  const jsonStr = LLSDSerialize.toJSON(original);
  const back = LLSDSerialize.fromJSON(jsonStr);
  assert.equal(back.get('key1').asString(), 'value1');
  assert.equal(back.get('key2').asInteger(), 123);
});

test('Executable schema adapter classes and packing utilities', () => {
  const v2 = new Vector2(1.0, 2.0);
  assert.deepEqual(Array.from(v2.getPacked()), [1.0, 2.0]);

  const v3 = new Vector3(1.0, 2.0, 3.0);
  assert.deepEqual(Array.from(v3.getPacked()), [1.0, 2.0, 3.0]);

  const ji = new JointInfluence(5, 0.75);
  assert.deepEqual(Array.from(ji.getPacked()), [5, 0.75]);

  const tt = new TextureTransformAdapter(2.0, 3.0, 1.0, 0.5, 0.25);
  const mat = new GLTFMaterialAdapter(0, 0.5, false, [tt]);
  assert.equal(mat.getPackedTransforms().length, 8);

  const block = new MeshBlockAdapter(DetailLevel.HIGHEST, [v3], [v3], [v2], [ji]);
  assert.deepEqual(Array.from(block.getPackedPositions()), [1.0, 2.0, 3.0]);
  assert.deepEqual(Array.from(block.getPackedNormals()), [1.0, 2.0, 3.0]);
  assert.deepEqual(Array.from(block.getPackedTexCoords()), [1.0, 2.0]);
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
