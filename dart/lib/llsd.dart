import 'dart:typed_data';

import 'lluuid.dart';
import 'lldate.dart';
import 'lluri.dart';
import 'llsd_serialize.dart';

enum LLSDType {
  undefined,
  boolean,
  integer,
  real,
  string,
  uuid,
  date,
  uri,
  binary,
  map,
  array
}

class LLSD {
  final LLSDType type;
  final dynamic _value;

  static final LLSD undefined = LLSD._(LLSDType.undefined, null);

  LLSD._(this.type, this._value);

  factory LLSD.boolVal(bool v) => LLSD._(LLSDType.boolean, v);
  factory LLSD.intVal(int v) =>
      LLSD._(LLSDType.integer, v); // 64-bit int in Dart
  factory LLSD.realVal(double v) => LLSD._(LLSDType.real, v);
  factory LLSD.stringVal(String v) => LLSD._(LLSDType.string, v);
  factory LLSD.uuidVal(LLUUID v) => LLSD._(LLSDType.uuid, v);
  factory LLSD.dateVal(LLDate v) => LLSD._(LLSDType.date, v);
  factory LLSD.uriVal(LLURI v) => LLSD._(LLSDType.uri, v);
  factory LLSD.binaryVal(Uint8List v) => LLSD._(LLSDType.binary, v);
  factory LLSD.mapVal(Map<String, LLSD> v) =>
      LLSD._(LLSDType.map, Map<String, LLSD>.from(v));
  factory LLSD.arrayVal(List<LLSD> v) =>
      LLSD._(LLSDType.array, List<LLSD>.from(v));

  static String serializeXml(LLSDValue value) =>
      LLSDSerialize.toXML(value.toLLSD());
  static LLSDValue parseXml(String xmlString) =>
      LLSDSerialize.fromXML(xmlString).toLLSDValue();
  static Uint8List serializeBinary(LLSDValue value) =>
      LLSDSerialize.toBinary(value.toLLSD());
  static LLSDValue parseBinary(Uint8List bytes) =>
      LLSDSerialize.fromBinary(bytes).toLLSDValue();
  static String serializeNotation(LLSDValue value) =>
      LLSDSerialize.toNotation(value.toLLSD());
  static LLSDValue parseNotation(String text) =>
      LLSDSerialize.fromNotation(text).toLLSDValue();

  factory LLSD.fromLLSDValue(LLSDValue val) {
    if (val is LLSDUndef) return LLSD.undefined;
    if (val is LLSDBoolean) return LLSD.boolVal(val.value);
    if (val is LLSDInteger) return LLSD.intVal(val.value);
    if (val is LLSDReal) return LLSD.realVal(val.value);
    if (val is LLSDString) return LLSD.stringVal(val.value);
    if (val is LLSDUUID) return LLSD.uuidVal(val.value);
    if (val is LLSDDate)
      return LLSD.dateVal(LLDate(val.value.millisecondsSinceEpoch / 1000.0));
    if (val is LLSDURI) return LLSD.uriVal(LLURI(val.value));
    if (val is LLSDBinary) return LLSD.binaryVal(val.value);
    if (val is LLSDArray)
      return LLSD
          .arrayVal(val.value.map((e) => LLSD.fromLLSDValue(e)).toList());
    if (val is LLSDMap) {
      final mapRes = <String, LLSD>{};
      for (final entry in val.value.entries) {
        mapRes[entry.key] = LLSD.fromLLSDValue(entry.value);
      }
      return LLSD.mapVal(mapRes);
    }
    return LLSD.undefined;
  }

  bool get isUndefined => type == LLSDType.undefined;
  bool get isDefined => !isUndefined;

  bool asBoolean() {
    switch (type) {
      case LLSDType.boolean:
        return _value as bool;
      case LLSDType.integer:
        return (_value as int) != 0;
      case LLSDType.real:
        return (_value as double) != 0.0;
      case LLSDType.string:
        return (_value as String).isNotEmpty;
      case LLSDType.uuid:
        return (_value as LLUUID).notNull;
      case LLSDType.date:
        return (_value as LLDate).notNull;
      case LLSDType.uri:
        return (_value as LLURI).asString().isNotEmpty;
      case LLSDType.binary:
        return (_value as Uint8List).isNotEmpty;
      case LLSDType.map:
        return (_value as Map<String, LLSD>).isNotEmpty;
      case LLSDType.array:
        return (_value as List<LLSD>).isNotEmpty;
      case LLSDType.undefined:
        return false;
    }
  }

  int asInt() {
    switch (type) {
      case LLSDType.boolean:
        return (_value as bool) ? 1 : 0;
      case LLSDType.integer:
        return _value as int;
      case LLSDType.real:
        return (_value as double).toInt();
      case LLSDType.string:
        return int.tryParse(_value as String) ?? 0;
      default:
        return 0;
    }
  }

  double asReal() {
    switch (type) {
      case LLSDType.boolean:
        return (_value as bool) ? 1.0 : 0.0;
      case LLSDType.integer:
        return (_value as int).toDouble();
      case LLSDType.real:
        return _value as double;
      case LLSDType.string:
        return double.tryParse(_value as String) ?? 0.0;
      default:
        return 0.0;
    }
  }

  String asString() {
    switch (type) {
      case LLSDType.boolean:
        return (_value as bool) ? 'true' : 'false';
      case LLSDType.integer:
        return (_value as int).toString();
      case LLSDType.real:
        return (_value as double).toString();
      case LLSDType.string:
        return _value as String;
      case LLSDType.uuid:
        return (_value as LLUUID).toString();
      case LLSDType.date:
        return (_value as LLDate).toISOString();
      case LLSDType.uri:
        return (_value as LLURI).asString();
      default:
        return '';
    }
  }

  LLUUID asUUID() {
    if (type == LLSDType.uuid) return _value as LLUUID;
    if (type == LLSDType.string) return LLUUID.fromString(_value as String);
    return LLUUID.nullUuid;
  }

  LLDate asDate() {
    if (type == LLSDType.date) return _value as LLDate;
    if (type == LLSDType.string) return LLDate.fromISOString(_value as String);
    return LLDate.nullDate;
  }

  LLURI asURI() {
    if (type == LLSDType.uri) return _value as LLURI;
    if (type == LLSDType.string) return LLURI(_value as String);
    return LLURI('');
  }

  Uint8List asBinary() {
    if (type == LLSDType.binary) return _value as Uint8List;
    return Uint8List(0);
  }

  Map<String, LLSD> asMap() {
    if (type == LLSDType.map) return Map<String, LLSD>.from(_value as Map);
    return <String, LLSD>{};
  }

  List<LLSD> asArray() {
    if (type == LLSDType.array) return List<LLSD>.from(_value as List);
    return <LLSD>[];
  }

  int get length {
    if (type == LLSDType.map) return (_value as Map<String, LLSD>).length;
    if (type == LLSDType.array) return (_value as List<LLSD>).length;
    return 0;
  }

  LLSD operator [](dynamic key) {
    if (type == LLSDType.map && key is String) {
      return (_value as Map<String, LLSD>)[key] ?? undefined;
    }
    if (type == LLSDType.array && key is int) {
      final list = _value as List<LLSD>;
      if (key >= 0 && key < list.length) return list[key];
    }
    return undefined;
  }

  void operator []=(dynamic key, LLSD value) {
    if (type == LLSDType.map && key is String) {
      (_value as Map<String, LLSD>)[key] = value;
    } else if (type == LLSDType.array && key is int) {
      final list = _value as List<LLSD>;
      while (list.length <= key) {
        list.add(undefined);
      }
      list[key] = value;
    }
  }

  LLSDValue toLLSDValue() {
    switch (type) {
      case LLSDType.undefined:
        return const LLSDUndef();
      case LLSDType.boolean:
        return LLSDBoolean(asBoolean());
      case LLSDType.integer:
        return LLSDInteger(asInt());
      case LLSDType.real:
        return LLSDReal(asReal());
      case LLSDType.string:
        return LLSDString(asString());
      case LLSDType.uuid:
        return LLSDUUID(asUUID());
      case LLSDType.date:
        final d = asDate();
        final ms = (d.secondsSinceEpoch * 1000).round();
        return LLSDDate(DateTime.fromMillisecondsSinceEpoch(ms, isUtc: true));
      case LLSDType.uri:
        return LLSDURI(asURI().asString());
      case LLSDType.binary:
        return LLSDBinary(asBinary());
      case LLSDType.array:
        final list = asArray();
        return LLSDArray(list.map((e) => e.toLLSDValue()).toList());
      case LLSDType.map:
        final m = asMap();
        final mapRes = <String, LLSDValue>{};
        for (final entry in m.entries) {
          mapRes[entry.key] = entry.value.toLLSDValue();
        }
        return LLSDMap(mapRes);
    }
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! LLSD) return false;
    if (type != other.type) return false;
    switch (type) {
      case LLSDType.undefined:
        return true;
      case LLSDType.boolean:
        return asBoolean() == other.asBoolean();
      case LLSDType.integer:
        return asInt() == other.asInt();
      case LLSDType.real:
        final r1 = asReal();
        final r2 = other.asReal();
        if (r1.isNaN && r2.isNaN) return true;
        if (r1.isInfinite && r2.isInfinite)
          return r1.isNegative == r2.isNegative;
        return (r1 - r2).abs() < 1e-5;
      case LLSDType.string:
        return asString().replaceAll('\r\n', '\n') ==
            other.asString().replaceAll('\r\n', '\n');
      case LLSDType.uuid:
        return asUUID() == other.asUUID();
      case LLSDType.date:
        return asDate() == other.asDate();
      case LLSDType.uri:
        return asURI() == other.asURI();
      case LLSDType.binary:
        final b1 = asBinary();
        final b2 = other.asBinary();
        if (b1.length != b2.length) return false;
        for (var i = 0; i < b1.length; i++) {
          if (b1[i] != b2[i]) return false;
        }
        return true;
      case LLSDType.array:
        final a1 = asArray();
        final a2 = other.asArray();
        if (a1.length != a2.length) return false;
        for (var i = 0; i < a1.length; i++) {
          if (a1[i] != a2[i]) return false;
        }
        return true;
      case LLSDType.map:
        final m1 = asMap();
        final m2 = other.asMap();
        if (m1.length != m2.length) return false;
        for (final k in m1.keys) {
          if (!m2.containsKey(k)) return false;
          if (m1[k] != m2[k]) return false;
        }
        return true;
    }
  }

  @override
  int get hashCode {
    switch (type) {
      case LLSDType.undefined:
        return 0;
      case LLSDType.boolean:
        return asBoolean().hashCode;
      case LLSDType.integer:
        return asInt().hashCode;
      case LLSDType.real:
        return asReal().hashCode;
      case LLSDType.string:
        return asString().replaceAll('\r\n', '\n').hashCode;
      case LLSDType.uuid:
        return asUUID().hashCode;
      case LLSDType.date:
        return asDate().hashCode;
      case LLSDType.uri:
        return asURI().hashCode;
      case LLSDType.binary:
        return Object.hashAll(asBinary());
      case LLSDType.array:
        return Object.hashAll(asArray());
      case LLSDType.map:
        return Object.hashAll(asMap().entries);
    }
  }

  @override
  String toString() => 'LLSD($type, $_value)';
}

/// Abstract representation of Second Life Data (LLSD) value.
abstract class LLSDValue {
  const LLSDValue();

  factory LLSDValue.undef() = LLSDUndef;
  factory LLSDValue.boolean(bool value) = LLSDBoolean;
  factory LLSDValue.integer(int value) = LLSDInteger;
  factory LLSDValue.real(double value) = LLSDReal;
  factory LLSDValue.string(String value) = LLSDString;
  factory LLSDValue.uuid(LLUUID value) = LLSDUUID;
  factory LLSDValue.date(DateTime value) = LLSDDate;
  factory LLSDValue.uri(String value) = LLSDURI;
  factory LLSDValue.binary(Uint8List value) = LLSDBinary;
  factory LLSDValue.array(List<LLSDValue> value) = LLSDArray;
  factory LLSDValue.map(Map<String, LLSDValue> value) = LLSDMap;

  LLSD toLLSD() => LLSD.fromLLSDValue(this);
}

class LLSDUndef extends LLSDValue {
  const LLSDUndef();

  @override
  bool operator ==(Object other) => other is LLSDUndef;

  @override
  int get hashCode => 0;

  @override
  String toString() => 'LLSDUndef()';
}

class LLSDBoolean extends LLSDValue {
  final bool value;
  const LLSDBoolean(this.value);

  @override
  bool operator ==(Object other) =>
      other is LLSDBoolean && other.value == value;

  @override
  int get hashCode => value.hashCode;

  @override
  String toString() => 'LLSDBoolean($value)';
}

class LLSDInteger extends LLSDValue {
  final int value;
  const LLSDInteger(this.value);

  @override
  bool operator ==(Object other) =>
      other is LLSDInteger && other.value == value;

  @override
  int get hashCode => value.hashCode;

  @override
  String toString() => 'LLSDInteger($value)';
}

class LLSDReal extends LLSDValue {
  final double value;
  const LLSDReal(this.value);

  @override
  bool operator ==(Object other) {
    if (other is! LLSDReal) return false;
    if (value.isNaN && other.value.isNaN) return true;
    if (value.isInfinite && other.value.isInfinite)
      return value.isNegative == other.value.isNegative;
    return (value - other.value).abs() < 1e-5;
  }

  @override
  int get hashCode => value.hashCode;

  @override
  String toString() => 'LLSDReal($value)';
}

class LLSDString extends LLSDValue {
  final String value;
  const LLSDString(this.value);

  @override
  bool operator ==(Object other) =>
      other is LLSDString &&
      other.value.replaceAll('\r\n', '\n') == value.replaceAll('\r\n', '\n');

  @override
  int get hashCode => value.replaceAll('\r\n', '\n').hashCode;

  @override
  String toString() => 'LLSDString($value)';
}

class LLSDUUID extends LLSDValue {
  final LLUUID value;
  const LLSDUUID(this.value);

  @override
  bool operator ==(Object other) => other is LLSDUUID && other.value == value;

  @override
  int get hashCode => value.hashCode;

  @override
  String toString() => 'LLSDUUID($value)';
}

class LLSDDate extends LLSDValue {
  final DateTime value;
  const LLSDDate(this.value);

  @override
  bool operator ==(Object other) =>
      other is LLSDDate &&
      (other.value.millisecondsSinceEpoch ~/ 1000) ==
          (value.millisecondsSinceEpoch ~/ 1000);

  @override
  int get hashCode => (value.millisecondsSinceEpoch ~/ 1000).hashCode;

  @override
  String toString() => 'LLSDDate(${value.toIso8601String()})';
}

class LLSDURI extends LLSDValue {
  final String value;
  const LLSDURI(this.value);

  @override
  bool operator ==(Object other) => other is LLSDURI && other.value == value;

  @override
  int get hashCode => value.hashCode;

  @override
  String toString() => 'LLSDURI($value)';
}

class LLSDBinary extends LLSDValue {
  final Uint8List value;
  const LLSDBinary(this.value);

  @override
  bool operator ==(Object other) {
    if (other is! LLSDBinary) return false;
    if (other.value.length != value.length) return false;
    for (var i = 0; i < value.length; i++) {
      if (other.value[i] != value[i]) return false;
    }
    return true;
  }

  @override
  int get hashCode => Object.hashAll(value);

  @override
  String toString() => 'LLSDBinary(${value.length} bytes)';
}

class LLSDArray extends LLSDValue {
  final List<LLSDValue> value;
  const LLSDArray(this.value);

  @override
  bool operator ==(Object other) {
    if (other is! LLSDArray) return false;
    if (other.value.length != value.length) return false;
    for (var i = 0; i < value.length; i++) {
      if (other.value[i] != value[i]) return false;
    }
    return true;
  }

  @override
  int get hashCode => Object.hashAll(value);

  @override
  String toString() => 'LLSDArray($value)';
}

class LLSDMap extends LLSDValue {
  final Map<String, LLSDValue> value;
  const LLSDMap(this.value);

  @override
  bool operator ==(Object other) {
    if (other is! LLSDMap) return false;
    if (other.value.length != value.length) return false;
    for (final key in value.keys) {
      if (!other.value.containsKey(key)) return false;
      if (other.value[key] != value[key]) return false;
    }
    return true;
  }

  @override
  int get hashCode => Object.hashAll(value.entries);

  @override
  String toString() => 'LLSDMap($value)';
}
