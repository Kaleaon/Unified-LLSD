import test from 'node:test';
import assert from 'node:assert';
import { PacketFlags, PacketCodec, CircuitManager } from '../index.js';

test('PacketFlags alignment', () => {
  assert.strictEqual(PacketFlags.ZeroCoded, 0x80);
  assert.strictEqual(PacketFlags.Reliable, 0x40);
  assert.strictEqual(PacketFlags.Resent, 0x20);
  assert.strictEqual(PacketFlags.Acks, 0x10);
});

test('PacketCodec header decode and zero-coding', () => {
  const raw = new Uint8Array([0x80, 0x00, 0x00, 0x00, 0x01, 0x00, 0x42, 0x00, 0x03, 0x05, 0x06]);
  const { header, headerLength } = PacketCodec.decodeHeader(raw);

  assert.strictEqual(header.isZeroCoded, true);
  assert.strictEqual(header.isReliable, false);
  assert.strictEqual(header.sequenceNumber, 1);
  assert.strictEqual(header.messageId, 0x42);
  assert.strictEqual(headerLength, 7);

  const uncompressed = PacketCodec.zeroDecode(raw, headerLength);
  assert.deepStrictEqual(Array.from(uncompressed), [0x80, 0x00, 0x00, 0x00, 0x01, 0x00, 0x42, 0x00, 0x00, 0x00, 0x05, 0x06]);

  const body = new Uint8Array([0x01, 0x00, 0x00, 0x00, 0x02]);
  const compressed = PacketCodec.zeroEncode(body);
  assert.deepStrictEqual(Array.from(compressed), [0x01, 0x00, 0x03, 0x02]);
});

test('CircuitManager sequence and ACKs', () => {
  const cm = new CircuitManager(12345);
  assert.strictEqual(cm.getNextSequenceNumber(), 1);
  assert.strictEqual(cm.getNextSequenceNumber(), 2);

  assert.strictEqual(cm.processInboundPacket(100, true), true);
  assert.strictEqual(cm.processInboundPacket(100, true), false); // Duplicate

  const pending = cm.getPendingAcks();
  assert.deepStrictEqual(pending, [100, 100]);

  cm.trackOutgoingPacket(5, new Uint8Array([1, 2, 3]));
  const resends = cm.getPacketsToResend(10000);
  assert.deepStrictEqual(resends, []);

  cm.processAcks([5]);
});
