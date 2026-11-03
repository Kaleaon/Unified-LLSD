import test from 'node:test';
import assert from 'node:assert';
import { LLSD } from '../llsd.js';
import { LLDate } from '../lldate.js';
import { LLUUID } from '../lluuid.js';
import { LLURI } from '../lluri.js';
import { LLSDSerialize } from '../llsd_serialize.js';

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

test('Two-pass direct single-buffer binary serialization', () => {
  const mapData = new Map<string, LLSD>();
  mapData.set('name', new LLSD('Test Avatar 😀'));
  mapData.set('balance', new LLSD(500n));
  mapData.set('active', new LLSD(true));
  mapData.set('empty_map', LLSD.emptyMap());
  mapData.set('empty_arr', LLSD.emptyArray());

  const root = new LLSD(mapData);
  const size = LLSDSerialize.calculateBinarySize(root);
  const bytes = LLSDSerialize.toBinary(root);

  assert.strictEqual(bytes.length, size);

  const back = LLSDSerialize.fromBinary(bytes);
  assert.strictEqual(back.get('name').asString(), 'Test Avatar 😀');
  assert.strictEqual(back.get('balance').asBigInt(), 500n);
  assert.strictEqual(back.get('active').asBoolean(), true);
  assert.strictEqual(back.get('empty_map').asMap().size, 0);
  assert.strictEqual(back.get('empty_arr').asArray().length, 0);
});
