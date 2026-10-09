import 'dart:typed_data';
import 'package:test/test.dart';
import '../lib/llsd.dart';
import '../lib/lluuid.dart';
import '../lib/lldate.dart';
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

  test('Notation roundtrip integer', () {
    final sd = LLSD.intVal(42);
    final notation = LLSDSerialize.toNotation(sd);
    expect(notation, equals('i42'));
    final back = LLSDSerialize.fromNotation(notation);
    expect(back.asInt(), equals(42));
  });

  test('Binary roundtrip all types', () {
    final uuid = LLUUID.fromString('d7be0172-11c5-4927-a0d4-123456789abc');
    final date = LLDate(1700000000);
    final uri = LLURI('http://example.com/api');
    final blob = Uint8List.fromList([1, 2, 3, 255, 0, 128]);

    final innerMap = {
      'uuid_key': LLSD.uuidVal(uuid),
      'uri_key': LLSD.uriVal(uri),
      'blob_key': LLSD.binaryVal(blob),
      'str_key': LLSD.stringVal('Hello World')
    };

    final arr = [
      LLSD.undefined,
      LLSD.boolVal(true),
      LLSD.boolVal(false),
      LLSD.intVal(100),
      LLSD.realVal(3.14159),
      LLSD.mapVal(innerMap)
    ];

    final rootMap = {
      'array_val': LLSD.arrayVal(arr),
      'date_val': LLSD.dateVal(date),
      'name': LLSD.stringVal('Grid Capability')
    };

    final root = LLSD.mapVal(rootMap);
    final bin = LLSDSerialize.toBinary(root);
    final back = LLSDSerialize.fromBinary(bin);

    expect(back['name'].asString(), equals('Grid Capability'));
    expect(back['date_val'].asDate().secondsSinceEpoch, closeTo(1700000000.0, 0.001));

    final backArr = back['array_val'];
    expect(backArr[0].isUndefined, isTrue);
    expect(backArr[1].asBoolean(), isTrue);
    expect(backArr[2].asBoolean(), isFalse);
    expect(backArr[3].asInt(), equals(100));
    expect(backArr[4].asReal(), closeTo(3.14159, 0.0001));

    final backInnerMap = backArr[5];
    expect(backInnerMap['uuid_key'].asUUID().toString(), equals('d7be0172-11c5-4927-a0d4-123456789abc'));
    expect(backInnerMap['uri_key'].asURI().asString(), equals('http://example.com/api'));
    expect(backInnerMap['blob_key'].asBinary(), equals(blob));
    expect(backInnerMap['str_key'].asString(), equals('Hello World'));
  });

  test('Notation roundtrip all types', () {
    final uuid = LLUUID.fromString('d7be0172-11c5-4927-a0d4-123456789abc');
    final date = LLDate.fromISOString('2023-05-01T12:00:00.000Z');
    final uri = LLURI('http://secondlife.com');
    final blob = Uint8List.fromList([10, 20, 30]);

    final map = {
      'u': LLSD.uuidVal(uuid),
      'd': LLSD.dateVal(date),
      'l': LLSD.uriVal(uri),
      'b': LLSD.binaryVal(blob),
      's': LLSD.stringVal('test string'),
      'arr': LLSD.arrayVal([LLSD.intVal(1), LLSD.stringVal('item2')])
    };

    final root = LLSD.mapVal(map);
    final notation = LLSDSerialize.toNotation(root);
    final back = LLSDSerialize.fromNotation(notation);

    expect(back['u'].asUUID().toString(), equals('d7be0172-11c5-4927-a0d4-123456789abc'));
    expect(back['l'].asURI().asString(), equals('http://secondlife.com'));
    expect(back['b'].asBinary(), equals(blob));
    expect(back['s'].asString(), equals('test string'));
    expect(back['arr'][0].asInt(), equals(1));
    expect(back['arr'][1].asString(), equals('item2'));
  });

  test('XML roundtrip all types', () {
    final uuid = LLUUID.fromString('d7be0172-11c5-4927-a0d4-123456789abc');
    final date = LLDate.fromISOString('2023-05-01T12:00:00.000Z');
    final uri = LLURI('http://secondlife.com');
    final blob = Uint8List.fromList([10, 20, 30]);

    final map = {
      'u': LLSD.uuidVal(uuid),
      'd': LLSD.dateVal(date),
      'l': LLSD.uriVal(uri),
      'b': LLSD.binaryVal(blob),
      's': LLSD.stringVal('xml string & <tag>'),
      'i': LLSD.intVal(12345),
      'r': LLSD.realVal(2.718),
      'bool': LLSD.boolVal(true),
      'undef': LLSD.undefined
    };

    final root = LLSD.mapVal(map);
    final xml = LLSDSerialize.toXML(root, withDeclaration: true);
    final back = LLSDSerialize.fromXML(xml);

    expect(back['u'].asUUID().toString(), equals('d7be0172-11c5-4927-a0d4-123456789abc'));
    expect(back['l'].asURI().asString(), equals('http://secondlife.com'));
    expect(back['b'].asBinary(), equals(blob));
    expect(back['s'].asString(), equals('xml string & <tag>'));
    expect(back['i'].asInt(), equals(12345));
    expect(back['r'].asReal(), closeTo(2.718, 0.001));
    expect(back['bool'].asBoolean(), isTrue);
    expect(back['undef'].isUndefined, isTrue);
  });
}
