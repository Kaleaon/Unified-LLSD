import 'dart:io';
import 'package:test/test.dart';
import '../lib/unified_llsd.dart';

Directory? _findVectorsDir() {
  final candidates = [
    '../../Linkpoint/legacy/Linkpoint/src/test/resources/llsd-conformance/vectors',
    '../Linkpoint/legacy/Linkpoint/src/test/resources/llsd-conformance/vectors',
    '/app/Linkpoint/legacy/Linkpoint/src/test/resources/llsd-conformance/vectors',
  ];
  for (final path in candidates) {
    final dir = Directory(path);
    if (dir.existsSync()) return dir;
  }
  return null;
}

void main() {
  group('Unified-LLSD Core Library Unit Tests', () {
    test('64-bit integer handling', () {
      const bigInt = 9223372036854775807;
      final sd = LLSD.intVal(bigInt);
      expect(sd.asInt(), equals(bigInt));
    });

    test('Binary date LE endianness', () {
      final sd = LLSD.dateVal(LLDate(123456789.0));
      final bin = LLSDSerialize.toBinary(sd);
      final back = LLSDSerialize.fromBinary(bin);
      expect(back.asDate().secondsSinceEpoch, closeTo(123456789.0, 0.001));
    });

    test('Notation roundtrip', () {
      final sd = LLSD.intVal(42);
      final notation = LLSDSerialize.toNotation(sd);
      expect(notation, equals('i42'));
      final back = LLSDSerialize.fromNotation(notation);
      expect(back.asInt(), equals(42));
    });
  });

  group(
      'Canonical 31 LLSD Test Vectors Conformance Suite (XML, Binary, Notation)',
      () {
    final vectorsDir = _findVectorsDir();

    test('Test vector directory exists and contains exactly 31 vectors', () {
      expect(vectorsDir, isNotNull,
          reason: 'Vectors directory must be located');
      final subdirs = vectorsDir!
          .listSync()
          .whereType<Directory>()
          .where(
              (d) => !d.path.split(Platform.pathSeparator).last.startsWith('.'))
          .toList();
      expect(subdirs.length, equals(31),
          reason: 'Expected 31 canonical test vectors');
    });

    if (vectorsDir != null) {
      final subdirs = vectorsDir
          .listSync()
          .whereType<Directory>()
          .where(
              (d) => !d.path.split(Platform.pathSeparator).last.startsWith('.'))
          .toList()
        ..sort((a, b) => a.path.compareTo(b.path));

      for (final fixtureDir in subdirs) {
        final fixtureName = fixtureDir.path.split(Platform.pathSeparator).last;

        test('Vector [$fixtureName] - XML, Binary & Notation conformance', () {
          final xmlFile = File('${fixtureDir.path}/value.xml');
          final binFile = File('${fixtureDir.path}/value.bin');

          expect(xmlFile.existsSync(), isTrue,
              reason: 'value.xml must exist for $fixtureName');
          expect(binFile.existsSync(), isTrue,
              reason: 'value.bin must exist for $fixtureName');

          final xmlString = xmlFile.readAsStringSync();
          final binBytes = binFile.readAsBytesSync();

          final fromXml = LLSDSerialize.fromXML(xmlString);
          final fromBin = LLSDSerialize.fromBinary(binBytes);

          expect(fromXml, equals(fromBin),
              reason: 'XML <-> BIN tree mismatch for $fixtureName');

          // Round-trip checks
          final reXml = LLSDSerialize.toXML(fromXml);
          final reBin = LLSDSerialize.toBinary(fromXml);
          final notationStr = LLSDSerialize.toNotation(fromXml);

          final reFromXml = LLSDSerialize.fromXML(reXml);
          final reFromBin = LLSDSerialize.fromBinary(reBin);
          final reFromNotation = LLSDSerialize.fromNotation(notationStr);

          expect(reFromXml, equals(fromXml),
              reason: 'XML round-trip mismatch for $fixtureName');
          expect(reFromBin, equals(fromXml),
              reason: 'BIN round-trip mismatch for $fixtureName');
          expect(reFromNotation, equals(fromXml),
              reason: 'Notation round-trip mismatch for $fixtureName');
        });
      }
    }
  });
}
