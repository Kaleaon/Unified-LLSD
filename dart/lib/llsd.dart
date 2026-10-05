import 'dart:typed_data';

import 'lluuid.dart';
import 'lldate.dart';
import 'lluri.dart';

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
  factory LLSD.intVal(int v) => LLSD._(LLSDType.integer, v); // 64-bit int in Dart
  factory LLSD.realVal(double v) => LLSD._(LLSDType.real, v);
  factory LLSD.stringVal(String v) => LLSD._(LLSDType.string, v);
  factory LLSD.uuidVal(LLUUID v) => LLSD._(LLSDType.uuid, v);
  factory LLSD.dateVal(LLDate v) => LLSD._(LLSDType.date, v);
  factory LLSD.uriVal(LLURI v) => LLSD._(LLSDType.uri, v);
  factory LLSD.binaryVal(Uint8List v) => LLSD._(LLSDType.binary, v);
  factory LLSD.mapVal(Map<String, LLSD> v) => LLSD._(LLSDType.map, v);
  factory LLSD.arrayVal(List<LLSD> v) => LLSD._(LLSDType.array, v);

  bool get isUndefined => type == LLSDType.undefined;
  bool get isDefined => !isUndefined;

  bool asBoolean() {
    switch (type) {
      case LLSDType.boolean: return _value as bool;
      case LLSDType.integer: return (_value as int) != 0;
      case LLSDType.real: return (_value as double) != 0.0;
      case LLSDType.string: return (_value as String).isNotEmpty;
      case LLSDType.uuid: return (_value as LLUUID).notNull;
      case LLSDType.date: return (_value as LLDate).notNull;
      case LLSDType.uri: return (_value as LLURI).asString().isNotEmpty;
      case LLSDType.binary: return (_value as Uint8List).isNotEmpty;
      case LLSDType.map: return (_value as Map<String, LLSD>).isNotEmpty;
      case LLSDType.array: return (_value as List<LLSD>).isNotEmpty;
      case LLSDType.undefined: return false;
    }
  }

  int asInt() {
    switch (type) {
      case LLSDType.boolean: return (_value as bool) ? 1 : 0;
      case LLSDType.integer: return _value as int;
      case LLSDType.real: return (_value as double).toInt();
      case LLSDType.string: return int.tryParse(_value as String) ?? 0;
      default: return 0;
    }
  }

  double asReal() {
    switch (type) {
      case LLSDType.boolean: return (_value as bool) ? 1.0 : 0.0;
      case LLSDType.integer: return (_value as int).toDouble();
      case LLSDType.real: return _value as double;
      case LLSDType.string: return double.tryParse(_value as String) ?? 0.0;
      default: return 0.0;
    }
  }

  String asString() {
    switch (type) {
      case LLSDType.boolean: return (_value as bool) ? 'true' : 'false';
      case LLSDType.integer: return (_value as int).toString();
      case LLSDType.real: return (_value as double).toString();
      case LLSDType.string: return _value as String;
      case LLSDType.uuid: return (_value as LLUUID).toString();
      case LLSDType.date: return (_value as LLDate).toISOString();
      case LLSDType.uri: return (_value as LLURI).asString();
      default: return '';
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
}
