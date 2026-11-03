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

test('Notation roundtrip nested containers', () => {
  const innerMap = new Map<string, LLSD>([
    ['a', new LLSD(100n)],
    ['b', new LLSD('hello world')],
    ['c', new LLSD([new LLSD(1n), new LLSD(2n), new LLSD(true)])],
  ]);
  const outerMap = new Map<string, LLSD>([
    ['inner', new LLSD(innerMap)],
    ['flag', new LLSD(false)],
    ['list', new LLSD([
      new LLSD('item1'),
      new LLSD(new Map<string, LLSD>([['key', new LLSD('value')]]))
    ])],
  ]);

  const outerSD = new LLSD(outerMap);
  const notation = LLSDSerialize.toNotation(outerSD);
  const parsed = LLSDSerialize.fromNotation(notation);

  assert.strictEqual(parsed.get('inner').get('a').asBigInt(), 100n);
  assert.strictEqual(parsed.get('inner').get('b').asString(), 'hello world');
  assert.strictEqual(parsed.get('inner').get('c').get(0).asBigInt(), 1n);
  assert.strictEqual(parsed.get('inner').get('c').get(2).asBoolean(), true);
  assert.strictEqual(parsed.get('flag').asBoolean(), false);
  assert.strictEqual(parsed.get('list').get(0).asString(), 'item1');
  assert.strictEqual(parsed.get('list').get(1).get('key').asString(), 'value');
});

test('Notation roundtrip reals and escapes', () => {
  const posReal = new LLSD(3.14159);
  const posParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(posReal));
  assert.strictEqual(Math.abs(posParsed.asReal() - 3.14159) < 0.00001, true);

  const nanVal = new LLSD(NaN);
  const nanParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(nanVal));
  assert.strictEqual(isNaN(nanParsed.asReal()), true);

  const infVal = new LLSD(Infinity);
  const infParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(infVal));
  assert.strictEqual(!isFinite(infParsed.asReal()) && infParsed.asReal() > 0, true);

  const escapedStr = new LLSD("Line1\nLine2\t'escaped\\quote'");
  const strNotation = LLSDSerialize.toNotation(escapedStr);
  const strParsed = LLSDSerialize.fromNotation(strNotation);
  assert.strictEqual(strParsed.asString(), "Line1\nLine2\t'escaped\\quote'");
});

test('Notation typed scalars', () => {
  const uuidVal = new LLUUID('d7b9a528-1b2c-4e3f-a5a6-7b8c9d0e1f2a');
  const uuidSD = new LLSD(uuidVal);
  const uuidParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(uuidSD));
  assert.strictEqual(uuidParsed.asUUID().toString(), uuidVal.toString());

  const dateVal = new LLDate(1672531199.0);
  const dateSD = new LLSD(dateVal);
  const dateParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(dateSD));
  assert.strictEqual(Math.abs(dateParsed.asDate().secondsSinceEpoch - 1672531199.0) < 0.001, true);

  const uriVal = new LLURI('https://secondlife.com/api/test');
  const uriSD = new LLSD(uriVal);
  const uriParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(uriSD));
  assert.strictEqual(uriParsed.asURI().asString(), 'https://secondlife.com/api/test');

  const binVal = new Uint8Array([0x01, 0x02, 0x03, 0xFF, 0x00, 0xAB]);
  const binSD = new LLSD(binVal);
  const binParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(binSD));
  assert.deepStrictEqual(binParsed.asBinary(), binVal);

  const undefParsed = LLSDSerialize.fromNotation('!');
  assert.strictEqual(undefParsed.isUndefined, true);
});
