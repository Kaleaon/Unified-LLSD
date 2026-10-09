import test from 'node:test';
import assert from 'node:assert';
import { LLSD } from '../llsd.js';
import { LLUUID } from '../lluuid.js';
import { LLDate } from '../lldate.js';
import { LLURI } from '../lluri.js';
import { XmlCodec } from '../xml_codec.js';

test('XmlCodec - scalar types roundtrip', () => {
  const undef = LLSD.undefined;
  assert.strictEqual(XmlCodec.toXML(undef), '<llsd><undef/></llsd>');
  assert.strictEqual(XmlCodec.fromXML('<llsd><undef/></llsd>').isUndefined, true);

  const boolTrue = new LLSD(true);
  assert.strictEqual(XmlCodec.toXML(boolTrue), '<llsd><boolean>true</boolean></llsd>');
  assert.strictEqual(XmlCodec.fromXML('<llsd><boolean>true</boolean></llsd>').asBoolean(), true);

  const intVal = new LLSD(123456789n);
  assert.strictEqual(XmlCodec.toXML(intVal), '<llsd><integer>123456789</integer></llsd>');
  assert.strictEqual(XmlCodec.fromXML('<llsd><integer>123456789</integer></llsd>').asBigInt(), 123456789n);

  const realVal = new LLSD(3.14159);
  assert.strictEqual(XmlCodec.toXML(realVal), '<llsd><real>3.14159</real></llsd>');
  assert.strictEqual(XmlCodec.fromXML('<llsd><real>3.14159</real></llsd>').asReal(), 3.14159);

  const nanVal = new LLSD(NaN);
  assert.strictEqual(XmlCodec.toXML(nanVal), '<llsd><real>nan</real></llsd>');
  assert.strictEqual(Number.isNaN(XmlCodec.fromXML('<llsd><real>nan</real></llsd>').asReal()), true);

  const infVal = new LLSD(Infinity);
  assert.strictEqual(XmlCodec.toXML(infVal), '<llsd><real>inf</real></llsd>');
  assert.strictEqual(XmlCodec.fromXML('<llsd><real>inf</real></llsd>').asReal(), Infinity);

  const strEsc = new LLSD('<Hello & "World">');
  const xmlEsc = XmlCodec.toXML(strEsc);
  assert.strictEqual(xmlEsc.includes('&lt;Hello &amp; &quot;World&quot;&gt;'), true);
  assert.strictEqual(XmlCodec.fromXML(xmlEsc).asString(), '<Hello & "World">');

  const uuid = new LLUUID('12345678-1234-1234-1234-123456789abc');
  const uuidSD = new LLSD(uuid);
  const xmlUuid = XmlCodec.toXML(uuidSD);
  assert.strictEqual(XmlCodec.fromXML(xmlUuid).asUUID().toString(), '12345678-1234-1234-1234-123456789abc');

  const dt = new LLDate('2026-01-01T12:00:00.000Z');
  const dtSD = new LLSD(dt);
  const xmlDt = XmlCodec.toXML(dtSD);
  assert.strictEqual(XmlCodec.fromXML(xmlDt).asDate().toISOString(), dt.toISOString());

  const uri = new LLURI('http://example.com/test?a=1&b=2');
  const uriSD = new LLSD(uri);
  const xmlUri = XmlCodec.toXML(uriSD);
  assert.strictEqual(XmlCodec.fromXML(xmlUri).asURI().asString(), 'http://example.com/test?a=1&b=2');

  const bin = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
  const binSD = new LLSD(bin);
  const xmlBin = XmlCodec.toXML(binSD);
  assert.strictEqual(XmlCodec.fromXML(xmlBin).asBinary().length, 5);
  assert.strictEqual(Buffer.from(XmlCodec.fromXML(xmlBin).asBinary()).toString(), 'Hello');
});

test('XmlCodec - base16 binary parsing', () => {
  const xmlHex = '<llsd><binary encoding="base16">48656c6c6f</binary></llsd>';
  const parsed = XmlCodec.fromXML(xmlHex);
  assert.strictEqual(Buffer.from(parsed.asBinary()).toString(), 'Hello');
});

test('XmlCodec - nested Map and Array containers', () => {
  const mapData = new Map<string, LLSD>();
  mapData.set('name', new LLSD('Test Map'));
  mapData.set('count', new LLSD(42n));

  const subArray = [new LLSD(1n), new LLSD(2n), new LLSD(3n)];
  mapData.set('items', new LLSD(subArray));

  const subMap = new Map<string, LLSD>();
  subMap.set('nestedKey', new LLSD('nestedVal'));
  mapData.set('subMap', new LLSD(subMap));

  const root = new LLSD(mapData);
  const xml = XmlCodec.toXML(root, true);

  assert.strictEqual(xml.startsWith('<?xml version="1.0" ?>\n<llsd><map>'), true);

  const decoded = XmlCodec.fromXML(xml);
  assert.strictEqual(decoded.asMap().get('name')?.asString(), 'Test Map');
  assert.strictEqual(decoded.asMap().get('count')?.asBigInt(), 42n);

  const decodedItems = decoded.asMap().get('items')?.asArray();
  assert.strictEqual(decodedItems?.length, 3);
  assert.strictEqual(decodedItems?.[0].asBigInt(), 1n);
  assert.strictEqual(decodedItems?.[1].asBigInt(), 2n);
  assert.strictEqual(decodedItems?.[2].asBigInt(), 3n);

  const decodedSubMap = decoded.asMap().get('subMap')?.asMap();
  assert.strictEqual(decodedSubMap?.get('nestedKey')?.asString(), 'nestedVal');
});
