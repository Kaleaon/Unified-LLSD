import 'dart:convert';
import 'dart:typed_data';
import 'package:test/test.dart';
import '../lib/llsd.dart';
import '../lib/lldate.dart';
import '../lib/lluuid.dart';
import '../lib/lluri.dart';
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

  test('All 11 LLSD type variants XML roundtrip', () {
    final uuidVal = LLUUID.fromString('d7a9aed0-8352-4467-b76f-0e1d03f0d01d');
    final dateVal = LLDate(1700000000.0);
    final uriVal = LLURI('https://secondlife.com/api');
    final binData = Uint8List.fromList([0x01, 0x02, 0x03, 0xFF]);

    final complexMap = LLSD.mapVal({
      'undef': LLSD.undefined,
      'bool_t': LLSD.boolVal(true),
      'bool_f': LLSD.boolVal(false),
      'int': LLSD.intVal(-123456789),
      'real': LLSD.realVal(3.14159),
      'string': LLSD.stringVal('Hello <World> & "Friends"'),
      'uuid': LLSD.uuidVal(uuidVal),
      'date': LLSD.dateVal(dateVal),
      'uri': LLSD.uriVal(uriVal),
      'binary': LLSD.binaryVal(binData),
      'array': LLSD.arrayVal([LLSD.intVal(1), LLSD.stringVal('two'), LLSD.boolVal(true)]),
    });

    final xml = LLSDSerialize.toXML(complexMap);
    final parsed = LLSDSerialize.fromXML(xml);

    expect(parsed['undef'].isUndefined, isTrue);
    expect(parsed['bool_t'].asBoolean(), isTrue);
    expect(parsed['bool_f'].asBoolean(), isFalse);
    expect(parsed['int'].asInt(), equals(-123456789));
    expect(parsed['real'].asReal(), closeTo(3.14159, 0.0001));
    expect(parsed['string'].asString(), equals('Hello <World> & "Friends"'));
    expect(parsed['uuid'].asUUID().toString(), equals(uuidVal.toString()));
    expect(parsed['date'].asDate().secondsSinceEpoch, closeTo(1700000000.0, 1.0));
    expect(parsed['uri'].asURI().asString(), equals('https://secondlife.com/api'));
    expect(parsed['binary'].asBinary(), equals(binData));
    expect(parsed['array'][0].asInt(), equals(1));
    expect(parsed['array'][1].asString(), equals('two'));
    expect(parsed['array'][2].asBoolean(), isTrue);
  });

  test('All 11 LLSD type variants Binary roundtrip', () {
    final uuidVal = LLUUID.fromString('a1b2c3d4-e5f6-7890-1234-56789abcdef0');
    final dateVal = LLDate(1600000000.0);
    final uriVal = LLURI('http://example.com/test');
    final binData = Uint8List.fromList([0xDE, 0xAD, 0xBE, 0xEF]);

    final complexMap = LLSD.mapVal({
      'undef': LLSD.undefined,
      'bool': LLSD.boolVal(true),
      'int': LLSD.intVal(987654321),
      'real': LLSD.realVal(-42.5),
      'string': LLSD.stringVal('Short string and long string test'),
      'uuid': LLSD.uuidVal(uuidVal),
      'date': LLSD.dateVal(dateVal),
      'uri': LLSD.uriVal(uriVal),
      'binary': LLSD.binaryVal(binData),
      'nested': LLSD.arrayVal([LLSD.mapVal({'inner': LLSD.intVal(100)})]),
    });

    final bin = LLSDSerialize.toBinary(complexMap);
    final parsed = LLSDSerialize.fromBinary(bin);

    expect(parsed['undef'].isUndefined, isTrue);
    expect(parsed['bool'].asBoolean(), isTrue);
    expect(parsed['int'].asInt(), equals(987654321));
    expect(parsed['real'].asReal(), equals(-42.5));
    expect(parsed['string'].asString(), equals('Short string and long string test'));
    expect(parsed['uuid'].asUUID().toString(), equals(uuidVal.toString()));
    expect(parsed['date'].asDate().secondsSinceEpoch, closeTo(1600000000.0, 0.001));
    expect(parsed['uri'].asURI().asString(), equals('http://example.com/test'));
    expect(parsed['binary'].asBinary(), equals(binData));
    expect(parsed['nested'][0]['inner'].asInt(), equals(100));
  });

  test('Binary Short String S tag parsing', () {
    // Tag 'S' (83) + 1-byte length 5 + "hello"
    final bytes = Uint8List.fromList([83, 5, ...utf8.encode('hello')]);
    final parsed = LLSDSerialize.fromBinary(bytes);
    expect(parsed.asString(), equals('hello'));
  });

  test('XML empty tag variants', () {
    final xml = '<llsd><map><key>u</key><undef/><key>s</key><string/><key>uuid</key><uuid/><key>m</key><map/><key>a</key><array/></map></llsd>';
    final parsed = LLSDSerialize.fromXML(xml);

    expect(parsed['u'].isUndefined, isTrue);
    expect(parsed['s'].asString(), equals(''));
    expect(parsed['uuid'].asUUID().isNull, isTrue);
    expect(parsed['m'].length, equals(0));
    expect(parsed['a'].length, equals(0));
  });

  test('Notation complex map and array roundtrip', () {
    final uuidVal = LLUUID.fromString('00000000-0000-0000-0000-000000000001');
    final map = LLSD.mapVal({
      'a': LLSD.intVal(1),
      'b': LLSD.stringVal("hello 'world'"),
      'c': LLSD.uuidVal(uuidVal),
      'd': LLSD.arrayVal([LLSD.boolVal(true), LLSD.boolVal(false)]),
    });

    final notation = LLSDSerialize.toNotation(map);
    final parsed = LLSDSerialize.fromNotation(notation);

    expect(parsed['a'].asInt(), equals(1));
    expect(parsed['b'].asString(), equals("hello 'world'"));
    expect(parsed['c'].asUUID().toString(), equals(uuidVal.toString()));
    expect(parsed['d'][0].asBoolean(), isTrue);
    expect(parsed['d'][1].asBoolean(), isFalse);
  });

  test('Auto-detect parse method', () {
    final sd = LLSD.mapVal({'test': LLSD.intVal(123)});

    final xml = LLSDSerialize.toXML(sd, withDeclaration: true);
    final parsedXml = LLSDSerialize.parseString(xml);
    expect(parsedXml['test'].asInt(), equals(123));

    final bin = Uint8List.fromList([...utf8.encode(LLSDSerialize.binaryHeader), ...LLSDSerialize.toBinary(sd)]);
    final parsedBin = LLSDSerialize.parse(bin);
    expect(parsedBin['test'].asInt(), equals(123));

    final notation = '${LLSDSerialize.notationHeader}${LLSDSerialize.toNotation(sd)}';
    final parsedNotation = LLSDSerialize.parseString(notation);
    expect(parsedNotation['test'].asInt(), equals(123));
  });
}
