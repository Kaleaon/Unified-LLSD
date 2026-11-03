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

  test('Notation roundtrip nested containers', () {
    final nestedMap = LLSD.mapVal({
      'a': LLSD.intVal(100),
      'b': LLSD.stringVal('hello world'),
      'c': LLSD.arrayVal([LLSD.intVal(1), LLSD.intVal(2), LLSD.boolVal(true)]),
    });
    final outerMap = LLSD.mapVal({
      'inner': nestedMap,
      'flag': LLSD.boolVal(false),
      'list': LLSD.arrayVal([
        LLSD.stringVal('item1'),
        LLSD.mapVal({'key': LLSD.stringVal('value')})
      ]),
    });

    final notation = LLSDSerialize.toNotation(outerMap);
    final parsed = LLSDSerialize.fromNotation(notation);

    expect(parsed['inner']['a'].asInt(), equals(100));
    expect(parsed['inner']['b'].asString(), equals('hello world'));
    expect(parsed['inner']['c'][0].asInt(), equals(1));
    expect(parsed['inner']['c'][2].asBoolean(), isTrue);
    expect(parsed['flag'].asBoolean(), isFalse);
    expect(parsed['list'][0].asString(), equals('item1'));
    expect(parsed['list'][1]['key'].asString(), equals('value'));
  });

  test('Notation roundtrip reals and escapes', () {
    final posReal = LLSD.realVal(3.14159);
    final posParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(posReal));
    expect(posParsed.asReal(), closeTo(3.14159, 0.00001));

    final nanVal = LLSD.realVal(double.nan);
    final nanParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(nanVal));
    expect(nanParsed.asReal().isNaN, isTrue);

    final infVal = LLSD.realVal(double.infinity);
    final infParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(infVal));
    expect(infParsed.asReal().isInfinite && infParsed.asReal() > 0, isTrue);

    final escapedStr = LLSD.stringVal("Line1\nLine2\t'escaped\\quote'");
    final strNotation = LLSDSerialize.toNotation(escapedStr);
    final strParsed = LLSDSerialize.fromNotation(strNotation);
    expect(strParsed.asString(), equals("Line1\nLine2\t'escaped\\quote'"));
  });

  test('Notation typed scalars', () {
    final uuidVal = LLUUID.fromString('d7b9a528-1b2c-4e3f-a5a6-7b8c9d0e1f2a');
    final uuidSD = LLSD.uuidVal(uuidVal);
    final uuidParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(uuidSD));
    expect(uuidParsed.asUUID(), equals(uuidVal));

    final dateVal = LLDate(1672531199.0);
    final dateSD = LLSD.dateVal(dateVal);
    final dateParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(dateSD));
    expect(dateParsed.asDate().secondsSinceEpoch, closeTo(1672531199.0, 0.001));

    final uriVal = LLURI('https://secondlife.com/api/test');
    final uriSD = LLSD.uriVal(uriVal);
    final uriParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(uriSD));
    expect(uriParsed.asURI().asString(), equals('https://secondlife.com/api/test'));

    final binVal = Uint8List.fromList([0x01, 0x02, 0x03, 0xFF, 0x00, 0xAB]);
    final binSD = LLSD.binaryVal(binVal);
    final binParsed = LLSDSerialize.fromNotation(LLSDSerialize.toNotation(binSD));
    expect(binParsed.asBinary(), equals(binVal));

    final undefParsed = LLSDSerialize.fromNotation('!');
    expect(undefParsed.isUndefined, isTrue);
  });
}
