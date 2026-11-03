import 'dart:typed_data';
import 'package:test/test.dart';
import '../lib/unified_llsd.dart';

void main() {
  test('PacketFlags alignment', () {
    expect(PacketFlags.zeroCoded, equals(0x80));
    expect(PacketFlags.reliable, equals(0x40));
    expect(PacketFlags.resent, equals(0x20));
    expect(PacketFlags.acks, equals(0x10));
  });

  test('PacketCodec header decode and zero coding', () {
    final raw = Uint8List.fromList([0x80, 0x00, 0x00, 0x00, 0x01, 0x00, 0x42, 0x00, 0x03, 0x05, 0x06]);
    final (header, headerLen) = PacketCodec.decodeHeader(raw);

    expect(header.isZeroCoded, isTrue);
    expect(header.isReliable, isFalse);
    expect(header.sequenceNumber, equals(1));
    expect(header.messageId, equals(0x42));
    expect(headerLen, equals(7));

    final uncompressed = PacketCodec.zeroDecode(raw, headerLen);
    expect(uncompressed, equals(Uint8List.fromList([0x80, 0x00, 0x00, 0x00, 0x01, 0x00, 0x42, 0x00, 0x00, 0x00, 0x05, 0x06])));

    final body = Uint8List.fromList([0x01, 0x00, 0x00, 0x00, 0x02]);
    final compressed = PacketCodec.zeroEncode(body);
    expect(compressed, equals(Uint8List.fromList([0x01, 0x00, 0x03, 0x02])));
  });

  test('CircuitManager sequence and ACKs', () {
    final cm = CircuitManager(12345);
    expect(cm.getNextSequenceNumber(), equals(1));
    expect(cm.getNextSequenceNumber(), equals(2));

    expect(cm.processInboundPacket(100, true), isTrue);
    expect(cm.processInboundPacket(100, true), isFalse); // Duplicate

    final pending = cm.getPendingAcks();
    expect(pending, equals([100, 100]));

    cm.trackOutgoingPacket(5, Uint8List.fromList([1, 2, 3]));
    final resends = cm.getPacketsToResend(Duration(seconds: 10));
    expect(resends, isEmpty);

    cm.processAcks([5]);
  });
}
