import 'dart:typed_data';
import 'package:test/test.dart';
import '../lib/lluuid.dart';

void main() {
  group('LLUUID equality and inequality', () {
    test('Reflexive equality (same instance)', () {
      final uuid = LLUUID(Uint8List.fromList(List.generate(16, (i) => i + 1)));
      expect(uuid == uuid, isTrue);
      expect(uuid, equals(uuid));
    });

    test('Null UUID equality', () {
      final null1 = LLUUID.nullUuid;
      final null2 = LLUUID(Uint8List(16));
      final null3 = LLUUID.fromString('00000000-0000-0000-0000-000000000000');

      expect(null1 == null2, isTrue);
      expect(null2 == null3, isTrue);
      expect(null1.isNull, isTrue);
      expect(null1.notNull, isFalse);
    });

    test('Symmetry and value equality for matching bytes', () {
      final b1 = Uint8List.fromList([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
      final b2 = Uint8List.fromList([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
      final u1 = LLUUID(b1);
      final u2 = LLUUID(b2);

      expect(u1 == u2, isTrue);
      expect(u2 == u1, isTrue);
      expect(u1, equals(u2));
    });

    test('Byte-mismatch detection across all 16 byte indices', () {
      final baseBytes = Uint8List.fromList([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160]);
      final baseUuid = LLUUID(baseBytes);

      for (var i = 0; i < 16; i++) {
        final modifiedBytes = Uint8List.fromList(baseBytes);
        modifiedBytes[i] = (modifiedBytes[i] + 1) % 256;
        final modifiedUuid = LLUUID(modifiedBytes);

        expect(baseUuid == modifiedUuid, isFalse, reason: 'Failed mismatch detection at byte index $i');
        expect(modifiedUuid == baseUuid, isFalse, reason: 'Failed symmetric mismatch detection at byte index $i');
      }
    });

    test('Comparison against non-LLUUID types', () {
      final uuid = LLUUID(Uint8List.fromList(List.generate(16, (i) => i)));
      expect(uuid == '00010203-0405-0607-0809-0a0b0c0d0e0f', isFalse);
      expect(uuid == 12345, isFalse);
      expect(uuid == Uint8List(16), isFalse);
    });

    test('Equality with string parsing roundtrip', () {
      const str = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
      final u1 = LLUUID.fromString(str);
      final u2 = LLUUID.fromString(str);
      expect(u1 == u2, isTrue);
      expect(u1.toString(), equals(str));
    });
  });
}
