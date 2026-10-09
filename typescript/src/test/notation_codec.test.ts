import test from 'node:test';
import assert from 'node:assert';
import { LLSD } from '../llsd.js';
import { LLUUID } from '../lluuid.js';
import { LLDate } from '../lldate.js';
import { LLURI } from '../lluri.js';
import { NotationCodec } from '../notation_codec.js';

test('NotationCodec - scalar types roundtrip', () => {
  const undef = LLSD.undefined;
  assert.strictEqual(NotationCodec.toNotation(undef), '!');
  assert.strictEqual(NotationCodec.fromNotation('!').isUndefined, true);

  const bTrue = new LLSD(true);
  assert.strictEqual(NotationCodec.toNotation(bTrue), 'true');
  assert.strictEqual(NotationCodec.fromNotation('true').asBoolean(), true);
  assert.strictEqual(NotationCodec.fromNotation('1').asBoolean(), true);

  const bFalse = new LLSD(false);
  assert.strictEqual(NotationCodec.toNotation(bFalse), 'false');
  assert.strictEqual(NotationCodec.fromNotation('false').asBoolean(), false);
  assert.strictEqual(NotationCodec.fromNotation('0').asBoolean(), false);

  const intVal = new LLSD(987654n);
  assert.strictEqual(NotationCodec.toNotation(intVal), 'i987654');
  assert.strictEqual(NotationCodec.fromNotation('i987654').asBigInt(), 987654n);

  const realVal = new LLSD(2.71828);
  assert.strictEqual(NotationCodec.toNotation(realVal), 'r2.71828');
  assert.strictEqual(NotationCodec.fromNotation('r2.71828').asReal(), 2.71828);

  const strVal = new LLSD('Single \' Quoted');
  const notStr = NotationCodec.toNotation(strVal);
  assert.strictEqual(NotationCodec.fromNotation(notStr).asString(), 'Single \' Quoted');

  const uuid = new LLUUID('00001111-2222-3333-4444-555566667777');
  const uuidSD = new LLSD(uuid);
  const notUuid = NotationCodec.toNotation(uuidSD);
  assert.strictEqual(notUuid, 'u00001111-2222-3333-4444-555566667777');
  assert.strictEqual(NotationCodec.fromNotation(notUuid).asUUID().toString(), '00001111-2222-3333-4444-555566667777');

  const dt = new LLDate('2026-05-15T08:30:00.000Z');
  const dtSD = new LLSD(dt);
  const notDt = NotationCodec.toNotation(dtSD);
  assert.strictEqual(NotationCodec.fromNotation(notDt).asDate().toISOString(), dt.toISOString());

  const uri = new LLURI('http://secondlife.com/about');
  const uriSD = new LLSD(uri);
  const notUri = NotationCodec.toNotation(uriSD);
  assert.strictEqual(NotationCodec.fromNotation(notUri).asURI().asString(), 'http://secondlife.com/about');

  const bin = new Uint8Array([1, 2, 3, 4]);
  const binSD = new LLSD(bin);
  const notBin = NotationCodec.toNotation(binSD);
  assert.strictEqual(notBin.startsWith('b64"'), true);
  assert.deepStrictEqual(Array.from(NotationCodec.fromNotation(notBin).asBinary()), [1, 2, 3, 4]);
});

test('NotationCodec - b16 and sized binary parsing', () => {
  const b16Not = 'b16"01020304"';
  assert.deepStrictEqual(Array.from(NotationCodec.fromNotation(b16Not).asBinary()), [1, 2, 3, 4]);

  const sizedNot = 'b(4)"\x01\x02\x03\x04"';
  assert.deepStrictEqual(Array.from(NotationCodec.fromNotation(sizedNot).asBinary()), [1, 2, 3, 4]);
});

test('NotationCodec - nested map and array containers', () => {
  const mapData = new Map<string, LLSD>();
  mapData.set('key1', new LLSD('val1'));
  mapData.set('key2', new LLSD([new LLSD(10n), new LLSD(20n)]));

  const root = new LLSD(mapData);
  const not = NotationCodec.toNotation(root);
  const decoded = NotationCodec.fromNotation(not);

  assert.strictEqual(decoded.asMap().get('key1')?.asString(), 'val1');
  const arr = decoded.asMap().get('key2')?.asArray();
  assert.strictEqual(arr?.length, 2);
  assert.strictEqual(arr?.[0].asBigInt(), 10n);
  assert.strictEqual(arr?.[1].asBigInt(), 20n);
});
