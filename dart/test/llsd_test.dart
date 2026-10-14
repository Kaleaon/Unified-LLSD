import 'package:test/test.dart';
import '../lib/llsd.dart';
import '../lib/lldate.dart';
import '../lib/llsd_serialize.dart';

void main() {
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

  group('XML deserialization', () {
    test('XML integer tag parsing', () {
      final pos = LLSDSerialize.fromXML('<llsd><integer>12345</integer></llsd>');
      expect(pos.asInt(), equals(12345));

      final neg = LLSDSerialize.fromXML('<integer>-42</integer>');
      expect(neg.asInt(), equals(-42));

      final zero = LLSDSerialize.fromXML('<integer>0</integer>');
      expect(zero.asInt(), equals(0));
    });

    test('XML string tag parsing', () {
      final str = LLSDSerialize.fromXML('<llsd><string>hello world</string></llsd>');
      expect(str.asString(), equals('hello world'));

      final emptyStr = LLSDSerialize.fromXML('<string></string>');
      expect(emptyStr.asString(), equals(''));
    });

    test('XML boolean tag parsing', () {
      final t1 = LLSDSerialize.fromXML('<llsd><boolean>true</boolean></llsd>');
      expect(t1.asBoolean(), isTrue);

      final t2 = LLSDSerialize.fromXML('<boolean>1</boolean>');
      expect(t2.asBoolean(), isTrue);

      final f1 = LLSDSerialize.fromXML('<llsd><boolean>false</boolean></llsd>');
      expect(f1.asBoolean(), isFalse);

      final f2 = LLSDSerialize.fromXML('<boolean>0</boolean>');
      expect(f2.asBoolean(), isFalse);
    });

    test('XML malformed tag handling preserves undefined semantics', () {
      expect(LLSDSerialize.fromXML(''), equals(LLSD.undefined));
      expect(LLSDSerialize.fromXML('<integer>abc</integer>'), equals(LLSD.undefined));
      expect(LLSDSerialize.fromXML('<integer>123'), equals(LLSD.undefined));
      expect(LLSDSerialize.fromXML('<string>unclosed'), equals(LLSD.undefined));
      expect(LLSDSerialize.fromXML('<boolean>unclosed'), equals(LLSD.undefined));
    });
  });
}
