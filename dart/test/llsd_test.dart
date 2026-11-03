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

  test('XML scalar and special values', () {
    final undefVal = LLSDSerialize.fromXML('<llsd><undef/></llsd>');
    expect(undefVal.isUndefined, isTrue);

    final emptyStr1 = LLSDSerialize.fromXML('<llsd><string/></llsd>');
    expect(emptyStr1.asString(), equals(''));

    final emptyStr2 = LLSDSerialize.fromXML('<llsd><string></string></llsd>');
    expect(emptyStr2.asString(), equals(''));

    final escXml = '<llsd><string>a &amp; b &lt; c &gt; &quot; d &apos; e &#39; f</string></llsd>';
    final parsedEsc = LLSDSerialize.fromXML(escXml);
    expect(parsedEsc.asString(), equals("a & b < c > \" d ' e ' f"));

    final serializedEsc = LLSDSerialize.toXML(parsedEsc);
    expect(serializedEsc, contains('a &amp; b &lt; c &gt; &quot; d &apos; e &apos; f'));

    const uuidStr = 'd7be4a36-22a7-47b1-9f22-921c17242e20';
    final parsedUuid = LLSDSerialize.fromXML('<llsd><uuid>$uuidStr</uuid></llsd>');
    expect(parsedUuid.asUUID().toString(), equals(uuidStr));

    const dateStr = '2023-05-15T12:00:00.000Z';
    final parsedDate = LLSDSerialize.fromXML('<llsd><date>$dateStr</date></llsd>');
    expect(parsedDate.asDate().toISOString(), equals(dateStr));

    final parsedBin = LLSDSerialize.fromXML('<llsd><binary encoding="base64">SGVsbG8gV29ybGQ=</binary></llsd>');
    expect(String.fromCharCodes(parsedBin.asBinary()), equals('Hello World'));
  });

  test('XML nested containers roundtrip', () {
    final sd = LLSD.mapVal({
      'int': LLSD.intVal(100),
      'bool': LLSD.boolVal(true),
      'str': LLSD.stringVal('<test>'),
      'arr': LLSD.arrayVal([LLSD.intVal(1), LLSD.stringVal('two'), LLSD.boolVal(false)])
    });

    final xml = LLSDSerialize.toXML(sd, withDeclaration: true);
    expect(xml, startsWith('<?xml version="1.0" ?>\n'));
    expect(xml, contains('<key>int</key><integer>100</integer>'));
    expect(xml, contains('<key>str</key><string>&lt;test&gt;</string>'));

    final back = LLSDSerialize.fromXML(xml);
    expect(back['int'].asInt(), equals(100));
    expect(back['bool'].asBoolean(), isTrue);
    expect(back['str'].asString(), equals('<test>'));
    expect(back['arr'][0].asInt(), equals(1));
    expect(back['arr'][1].asString(), equals('two'));
    expect(back['arr'][2].asBoolean(), isFalse);
  });
}
