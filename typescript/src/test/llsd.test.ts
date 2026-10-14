import test from 'node:test';
import assert from 'node:assert';
import { LLSD } from '../llsd.js';
import { LLDate } from '../lldate.js';
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

test('XML scalar and special values', () => {
  const undefVal = LLSDSerialize.fromXML('<llsd><undef/></llsd>');
  assert.strictEqual(undefVal.isUndefined, true);

  const emptyStr1 = LLSDSerialize.fromXML('<llsd><string/></llsd>');
  assert.strictEqual(emptyStr1.asString(), '');

  const emptyStr2 = LLSDSerialize.fromXML('<llsd><string></string></llsd>');
  assert.strictEqual(emptyStr2.asString(), '');

  const escXml = '<llsd><string>a &amp; b &lt; c &gt; &quot; d &apos; e &#39; f</string></llsd>';
  const parsedEsc = LLSDSerialize.fromXML(escXml);
  assert.strictEqual(parsedEsc.asString(), "a & b < c > \" d ' e ' f");

  const serializedEsc = LLSDSerialize.toXML(parsedEsc);
  assert.strictEqual(serializedEsc.includes('a &amp; b &lt; c &gt; &quot; d &apos; e &apos; f'), true);

  const uuidStr = 'd7be4a36-22a7-47b1-9f22-921c17242e20';
  const parsedUuid = LLSDSerialize.fromXML(`<llsd><uuid>${uuidStr}</uuid></llsd>`);
  assert.strictEqual(parsedUuid.asUUID().toString(), uuidStr);

  const dateStr = '2023-05-15T12:00:00.000Z';
  const parsedDate = LLSDSerialize.fromXML(`<llsd><date>${dateStr}</date></llsd>`);
  assert.strictEqual(parsedDate.asDate().toISOString(), dateStr);

  const parsedBin = LLSDSerialize.fromXML('<llsd><binary encoding="base64">SGVsbG8gV29ybGQ=</binary></llsd>');
  assert.strictEqual(Buffer.from(parsedBin.asBinary()).toString('utf8'), 'Hello World');
});

test('XML nested containers roundtrip', () => {
  const map = new Map<string, LLSD>();
  map.set('int', new LLSD(100n));
  map.set('bool', new LLSD(true));
  map.set('str', new LLSD('<test>'));
  map.set('arr', new LLSD([new LLSD(1n), new LLSD('two'), new LLSD(false)]));

  const sd = new LLSD(map);

  const xml = LLSDSerialize.toXML(sd, true);
  assert.strictEqual(xml.startsWith('<?xml version="1.0" ?>\n'), true);
  assert.strictEqual(xml.includes('<key>int</key><integer>100</integer>'), true);
  assert.strictEqual(xml.includes('<key>str</key><string>&lt;test&gt;</string>'), true);

  const back = LLSDSerialize.fromXML(xml);
  assert.strictEqual(back.get('int').asBigInt(), 100n);
  assert.strictEqual(back.get('bool').asBoolean(), true);
  assert.strictEqual(back.get('str').asString(), '<test>');
  assert.strictEqual(back.get('arr').get(0).asBigInt(), 1n);
  assert.strictEqual(back.get('arr').get(1).asString(), 'two');
  assert.strictEqual(back.get('arr').get(2).asBoolean(), false);
});
