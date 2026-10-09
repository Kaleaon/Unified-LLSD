import test from 'node:test';
import assert from 'node:assert';
import { LLSD } from '../llsd.js';
import { LLUUID } from '../lluuid.js';
import { LLDate } from '../lldate.js';
import { LLURI } from '../lluri.js';
import { BinaryCodec } from '../binary_codec.js';

test('BinaryCodec - scalar types roundtrip', () => {
  const undef = LLSD.undefined;
  assert.strictEqual(BinaryCodec.decode(BinaryCodec.encode(undef)).isUndefined, true);

  const bTrue = new LLSD(true);
  assert.strictEqual(BinaryCodec.decode(BinaryCodec.encode(bTrue)).asBoolean(), true);

  const bFalse = new LLSD(false);
  assert.strictEqual(BinaryCodec.decode(BinaryCodec.encode(bFalse)).asBoolean(), false);

  const intVal = new LLSD(2147483647n);
  assert.strictEqual(BinaryCodec.decode(BinaryCodec.encode(intVal)).asBigInt(), 2147483647n);

  const realVal = new LLSD(12345.6789);
  assert.strictEqual(BinaryCodec.decode(BinaryCodec.encode(realVal)).asReal(), 12345.6789);

  const strVal = new LLSD('Binary String Test 🚀');
  assert.strictEqual(BinaryCodec.decode(BinaryCodec.encode(strVal)).asString(), 'Binary String Test 🚀');

  const uuid = new LLUUID('a1b2c3d4-e5f6-7890-1234-56789abcdef0');
  const uuidSD = new LLSD(uuid);
  const binUuid = BinaryCodec.encode(uuidSD);
  assert.strictEqual(binUuid[0], 117); // 'u' tag
  assert.strictEqual(binUuid.length, 17);
  assert.strictEqual(BinaryCodec.decode(binUuid).asUUID().toString(), 'a1b2c3d4-e5f6-7890-1234-56789abcdef0');

  const dt = new LLDate(1700000000.5);
  const dtSD = new LLSD(dt);
  const binDt = BinaryCodec.encode(dtSD);
  assert.strictEqual(binDt[0], 100); // 'd' tag
  assert.strictEqual(binDt.length, 9);
  const decodedDt = BinaryCodec.decode(binDt).asDate();
  assert.strictEqual(Math.abs(decodedDt.secondsSinceEpoch - 1700000000.5) < 0.0001, true);

  const uri = new LLURI('https://secondlife.com/api');
  const uriSD = new LLSD(uri);
  const binUri = BinaryCodec.encode(uriSD);
  assert.strictEqual(binUri[0], 108); // 'l' tag
  assert.strictEqual(BinaryCodec.decode(binUri).asURI().asString(), 'https://secondlife.com/api');

  const buf = new Uint8Array([0, 1, 2, 255, 254, 253]);
  const binSD = new LLSD(buf);
  const encodedBin = BinaryCodec.encode(binSD);
  assert.strictEqual(encodedBin[0], 98); // 'b' tag
  const decodedBuf = BinaryCodec.decode(encodedBin).asBinary();
  assert.deepStrictEqual(Array.from(decodedBuf), [0, 1, 2, 255, 254, 253]);
});

test('BinaryCodec - nested maps and arrays without data truncation', () => {
  const mapData = new Map<string, LLSD>();
  mapData.set('uuid', new LLSD(new LLUUID('00112233-4455-6677-8899-aabbccddeeff')));
  mapData.set('uri', new LLSD(new LLURI('http://localhost')));
  mapData.set('buffer', new LLSD(new Uint8Array([10, 20, 30])));
  mapData.set('nestedList', new LLSD([new LLSD('elem1'), new LLSD(100n)]));

  const root = new LLSD(mapData);
  const encoded = BinaryCodec.encode(root);
  const decoded = BinaryCodec.decode(encoded);

  assert.strictEqual(decoded.asMap().get('uuid')?.asUUID().toString(), '00112233-4455-6677-8899-aabbccddeeff');
  assert.strictEqual(decoded.asMap().get('uri')?.asURI().asString(), 'http://localhost');
  assert.deepStrictEqual(Array.from(decoded.asMap().get('buffer')?.asBinary() || []), [10, 20, 30]);

  const list = decoded.asMap().get('nestedList')?.asArray();
  assert.strictEqual(list?.length, 2);
  assert.strictEqual(list?.[0].asString(), 'elem1');
  assert.strictEqual(list?.[1].asBigInt(), 100n);
});

test('BinaryCodec - header tolerance on decode', () => {
  const headerBytes = Buffer.from('<? llsd/binary ?>\n');
  const payloadSD = new LLSD(1234n);
  const payloadBytes = BinaryCodec.encode(payloadSD);

  const fullBytes = new Uint8Array(headerBytes.length + payloadBytes.length);
  fullBytes.set(headerBytes, 0);
  fullBytes.set(payloadBytes, headerBytes.length);

  const decoded = BinaryCodec.decode(fullBytes);
  assert.strictEqual(decoded.asBigInt(), 1234n);
});
