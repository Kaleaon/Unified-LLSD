import test from 'node:test';
import assert from 'node:assert';
import { LLSD } from '../llsd.js';
import { LLUUID } from '../lluuid.js';
import { LLDate } from '../lldate.js';
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

test('Notation roundtrip integer', () => {
  const sd = new LLSD(42n);
  const notation = LLSDSerialize.toNotation(sd);
  assert.strictEqual(notation, 'i42');
  const back = LLSDSerialize.fromNotation(notation);
  assert.strictEqual(back.asBigInt(), 42n);
});

test('Binary roundtrip all types', () => {
  const uuid = new LLUUID('d7be0172-11c5-4927-a0d4-123456789abc');
  const date = new LLDate(1700000000);
  const uri = new LLURI('http://example.com/api');
  const blob = new Uint8Array([1, 2, 3, 255, 0, 128]);

  const innerMap = new Map<string, LLSD>([
    ['uuid_key', new LLSD(uuid)],
    ['uri_key', new LLSD(uri)],
    ['blob_key', new LLSD(blob)],
    ['str_key', new LLSD('Hello World')]
  ]);

  const arr = [
    LLSD.undefined,
    new LLSD(true),
    new LLSD(false),
    new LLSD(100n),
    new LLSD(3.14159),
    new LLSD(innerMap)
  ];

  const rootMap = new Map<string, LLSD>([
    ['array_val', new LLSD(arr)],
    ['date_val', new LLSD(date)],
    ['name', new LLSD('Grid Capability')]
  ]);

  const root = new LLSD(rootMap);
  const bin = LLSDSerialize.toBinary(root);
  const back = LLSDSerialize.fromBinary(bin);

  assert.strictEqual(back.get('name').asString(), 'Grid Capability');
  assert.strictEqual(Math.abs(back.get('date_val').asDate().secondsSinceEpoch - 1700000000) < 0.001, true);

  const backArr = back.get('array_val');
  assert.strictEqual(backArr.get(0).isUndefined, true);
  assert.strictEqual(backArr.get(1).asBoolean(), true);
  assert.strictEqual(backArr.get(2).asBoolean(), false);
  assert.strictEqual(backArr.get(3).asBigInt(), 100n);
  assert.strictEqual(Math.abs(backArr.get(4).asReal() - 3.14159) < 0.0001, true);

  const backInnerMap = backArr.get(5);
  assert.strictEqual(backInnerMap.get('uuid_key').asUUID().toString(), 'd7be0172-11c5-4927-a0d4-123456789abc');
  assert.strictEqual(backInnerMap.get('uri_key').asURI().asString(), 'http://example.com/api');
  assert.deepStrictEqual(backInnerMap.get('blob_key').asBinary(), blob);
  assert.strictEqual(backInnerMap.get('str_key').asString(), 'Hello World');
});

test('Notation roundtrip all types', () => {
  const uuid = new LLUUID('d7be0172-11c5-4927-a0d4-123456789abc');
  const date = new LLDate('2023-05-01T12:00:00.000Z');
  const uri = new LLURI('http://secondlife.com');
  const blob = new Uint8Array([10, 20, 30]);

  const map = new Map<string, LLSD>([
    ['u', new LLSD(uuid)],
    ['d', new LLSD(date)],
    ['l', new LLSD(uri)],
    ['b', new LLSD(blob)],
    ['s', new LLSD('test string')],
    ['arr', new LLSD([new LLSD(1n), new LLSD('item2')])]
  ]);

  const root = new LLSD(map);
  const notation = LLSDSerialize.toNotation(root);
  const back = LLSDSerialize.fromNotation(notation);

  assert.strictEqual(back.get('u').asUUID().toString(), 'd7be0172-11c5-4927-a0d4-123456789abc');
  assert.strictEqual(back.get('l').asURI().asString(), 'http://secondlife.com');
  assert.deepStrictEqual(back.get('b').asBinary(), blob);
  assert.strictEqual(back.get('s').asString(), 'test string');
  assert.strictEqual(back.get('arr').get(0).asBigInt(), 1n);
  assert.strictEqual(back.get('arr').get(1).asString(), 'item2');
});

test('XML roundtrip all types', () => {
  const uuid = new LLUUID('d7be0172-11c5-4927-a0d4-123456789abc');
  const date = new LLDate('2023-05-01T12:00:00.000Z');
  const uri = new LLURI('http://secondlife.com');
  const blob = new Uint8Array([10, 20, 30]);

  const map = new Map<string, LLSD>([
    ['u', new LLSD(uuid)],
    ['d', new LLSD(date)],
    ['l', new LLSD(uri)],
    ['b', new LLSD(blob)],
    ['s', new LLSD('xml string & <tag>')],
    ['i', new LLSD(12345n)],
    ['r', new LLSD(2.718)],
    ['bool', new LLSD(true)],
    ['undef', LLSD.undefined]
  ]);

  const root = new LLSD(map);
  const xml = LLSDSerialize.toXML(root, true);
  const back = LLSDSerialize.fromXML(xml);

  assert.strictEqual(back.get('u').asUUID().toString(), 'd7be0172-11c5-4927-a0d4-123456789abc');
  assert.strictEqual(back.get('l').asURI().asString(), 'http://secondlife.com');
  assert.deepStrictEqual(back.get('b').asBinary(), blob);
  assert.strictEqual(back.get('s').asString(), 'xml string & <tag>');
  assert.strictEqual(back.get('i').asBigInt(), 12345n);
  assert.strictEqual(Math.abs(back.get('r').asReal() - 2.718) < 0.001, true);
  assert.strictEqual(back.get('bool').asBoolean(), true);
  assert.strictEqual(back.get('undef').isUndefined, true);
});
