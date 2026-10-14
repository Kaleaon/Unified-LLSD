import 'dart:convert';
import 'dart:typed_data';

import 'llsd.dart';
import 'lluuid.dart';
import 'lldate.dart';
import 'lluri.dart';

class LLSDSerialize {
  static const String binaryHeader = "<? llsd/binary ?>\n";
  static const String notationHeader = "<? llsd/notation ?>\n";
  static const String xmlHeader = "<?xml version=\"1.0\" ?>\n";

  // --- XML ---
  static String toXML(LLSD sd, {bool withDeclaration = false}) {
    final sb = StringBuffer();
    if (withDeclaration) sb.write(xmlHeader);
    sb.write('<llsd>');
    _writeXmlElement(sb, sd);
    sb.write('</llsd>');
    return sb.toString();
  }

  static void _writeXmlElement(StringBuffer sb, LLSD sd) {
    switch (sd.type) {
      case LLSDType.undefined:
        sb.write('<undef/>');
        break;
      case LLSDType.boolean:
        sb.write('<boolean>${sd.asBoolean() ? "true" : "false"}</boolean>');
        break;
      case LLSDType.integer:
        sb.write('<integer>${sd.asInt()}</integer>');
        break;
      case LLSDType.real:
        final r = sd.asReal();
        if (r.isNaN) sb.write('<real>nan</real>');
        else if (r.isInfinite) sb.write('<real>${r > 0 ? "inf" : "-inf"}</real>');
        else sb.write('<real>$r</real>');
        break;
      case LLSDType.string:
        final s = sd.asString();
        if (s.isEmpty) sb.write('<string/>');
        else sb.write('<string>${_xmlEscape(s)}</string>');
        break;
      case LLSDType.uuid:
        final u = sd.asUUID();
        if (u.isNull) sb.write('<uuid/>');
        else sb.write('<uuid>$u</uuid>');
        break;
      case LLSDType.date:
        sb.write('<date>${sd.asDate().toISOString()}</date>');
        break;
      case LLSDType.uri:
        sb.write('<uri>${_xmlEscape(sd.asURI().asString())}</uri>');
        break;
      case LLSDType.binary:
        sb.write('<binary encoding="base64">${base64Encode(sd.asBinary())}</binary>');
        break;
      case LLSDType.map:
        sb.write('<map>');
        final map = sd as dynamic;
        // Iterate map entries
        break;
      case LLSDType.array:
        sb.write('<array>');
        break;
    }
  }

  static String _xmlEscape(String s) {
    return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  }

  static LLSD fromXML(String xml) {
    final clean = xml.trim();
    if (clean.isEmpty) return LLSD.undefined;
    if (clean.contains('<integer>')) {
      final match = RegExp(r'<integer>(-?\d+)</integer>').firstMatch(clean);
      if (match != null) return LLSD.intVal(int.parse(match.group(1)!));
    }
    if (clean.contains('<string>')) {
      final match = RegExp(r'<string>(.*?)</string>').firstMatch(clean);
      if (match != null) return LLSD.stringVal(match.group(1)!);
    }
    if (clean.contains('<boolean>')) {
      final match = RegExp(r'<boolean>(.*?)</boolean>').firstMatch(clean);
      if (match != null) return LLSD.boolVal(match.group(1) == 'true' || match.group(1) == '1');
    }
    return LLSD.undefined;
  }

  // --- Binary ---
  static Uint8List toBinary(LLSD sd) {
    final builder = BytesBuilder();
    _writeBinary(builder, sd);
    return builder.toBytes();
  }

  static void _writeBinary(BytesBuilder bb, LLSD sd) {
    switch (sd.type) {
      case LLSDType.undefined:
        bb.addByte(33); // '!'
        break;
      case LLSDType.boolean:
        bb.addByte(sd.asBoolean() ? 49 : 48); // '1' or '0'
        break;
      case LLSDType.integer:
        bb.addByte(105); // 'i'
        final bdata = ByteData(4)..setInt32(0, sd.asInt(), Endian.big);
        bb.add(bdata.buffer.asUint8List());
        break;
      case LLSDType.real:
        bb.addByte(114); // 'r'
        final bdata = ByteData(8)..setFloat64(0, sd.asReal(), Endian.big);
        bb.add(bdata.buffer.asUint8List());
        break;
      case LLSDType.string:
        bb.addByte(115); // 's'
        final bytes = utf8.encode(sd.asString());
        final bdata = ByteData(4)..setInt32(0, bytes.length, Endian.big);
        bb.add(bdata.buffer.asUint8List());
        bb.add(bytes);
        break;
      case LLSDType.uuid:
        bb.addByte(117); // 'u'
        bb.add(sd.asUUID().bytes);
        break;
      case LLSDType.date:
        bb.addByte(100); // 'd'
        // Date is LE 8-byte double!
        final bdata = ByteData(8)..setFloat64(0, sd.asDate().secondsSinceEpoch, Endian.little);
        bb.add(bdata.buffer.asUint8List());
        break;
      case LLSDType.uri:
        bb.addByte(108); // 'l'
        final bytes = utf8.encode(sd.asURI().asString());
        final bdata = ByteData(4)..setInt32(0, bytes.length, Endian.big);
        bb.add(bdata.buffer.asUint8List());
        bb.add(bytes);
        break;
      case LLSDType.binary:
        bb.addByte(98); // 'b'
        final bytes = sd.asBinary();
        final bdata = ByteData(4)..setInt32(0, bytes.length, Endian.big);
        bb.add(bdata.buffer.asUint8List());
        bb.add(bytes);
        break;
      case LLSDType.map:
        bb.addByte(123); // '{'
        final bdata = ByteData(4)..setInt32(0, 0, Endian.big);
        bb.add(bdata.buffer.asUint8List());
        bb.addByte(125); // '}'
        break;
      case LLSDType.array:
        bb.addByte(91); // '['
        final bdata = ByteData(4)..setInt32(0, 0, Endian.big);
        bb.add(bdata.buffer.asUint8List());
        bb.addByte(93); // ']'
        break;
    }
  }

  static LLSD fromBinary(Uint8List bytes) {
    if (bytes.isEmpty) return LLSD.undefined;
    var pos = 0;
    final bd = ByteData.view(bytes.buffer, bytes.offsetInBytes, bytes.length);
    final tag = bytes[pos++];
    switch (tag) {
      case 33: return LLSD.undefined;
      case 49: return LLSD.boolVal(true);
      case 48: return LLSD.boolVal(false);
      case 105:
        final v = bd.getInt32(pos, Endian.big);
        return LLSD.intVal(v);
      case 114:
        final v = bd.getFloat64(pos, Endian.big);
        return LLSD.realVal(v);
      case 100:
        final v = bd.getFloat64(pos, Endian.little);
        return LLSD.dateVal(LLDate(v));
      default: return LLSD.undefined;
    }
  }

  // --- Notation ---
  static String toNotation(LLSD sd) {
    switch (sd.type) {
      case LLSDType.undefined:
        return '!';
      case LLSDType.boolean:
        return sd.asBoolean() ? 'true' : 'false';
      case LLSDType.integer:
        return 'i${sd.asInt()}';
      case LLSDType.real:
        final r = sd.asReal();
        if (r.isNaN) return 'rnan';
        if (r.isInfinite) return r > 0 ? 'rinf' : 'r-inf';
        return 'r$r';
      case LLSDType.string:
        return "'${_escapeNotationString(sd.asString())}'";
      case LLSDType.uuid:
        return 'u${sd.asUUID()}';
      case LLSDType.date:
        return 'd"${sd.asDate().toISOString()}"';
      case LLSDType.uri:
        return 'l"${sd.asURI().asString()}"';
      case LLSDType.binary:
        return 'b64"${base64Encode(sd.asBinary())}"';
      case LLSDType.map:
        final map = sd.asMap();
        final sb = StringBuffer('{');
        var first = true;
        for (final entry in map.entries) {
          if (!first) sb.write(',');
          first = false;
          sb.write("'${_escapeNotationString(entry.key)}':${toNotation(entry.value)}");
        }
        sb.write('}');
        return sb.toString();
      case LLSDType.array:
        final list = sd.asArray();
        final sb = StringBuffer('[');
        var first = true;
        for (final item in list) {
          if (!first) sb.write(',');
          first = false;
          sb.write(toNotation(item));
        }
        sb.write(']');
        return sb.toString();
    }
  }

  static String _escapeNotationString(String s) {
    return s.replaceAll(r'\', r'\\').replaceAll("'", r"\'");
  }

  static LLSD fromNotation(String text) {
    var clean = text;
    if (clean.startsWith('<?llsd/notation?>') || clean.startsWith('<? llsd/notation ?>')) {
      final nl = clean.indexOf('\n');
      if (nl >= 0) {
        clean = clean.substring(nl + 1);
      }
    }
    return _DartNotationParser(clean).parse();
  }
}

class _DartNotationParser {
  final String text;
  int pos = 0;

  _DartNotationParser(this.text);

  LLSD parse() {
    skipWs();
    return parseValue();
  }

  void skipWs() {
    while (pos < text.length && _isWs(text.codeUnitAt(pos))) {
      pos++;
    }
  }

  bool _isWs(int code) => code == 32 || code == 9 || code == 10 || code == 13;

  int peek() => pos < text.length ? text.codeUnitAt(pos) : 0;

  int peekAt(int offset) =>
      pos + offset < text.length ? text.codeUnitAt(pos + offset) : 0;

  int consume() => pos < text.length ? text.codeUnitAt(pos++) : 0;

  LLSD parseValue() {
    skipWs();
    if (pos >= text.length) return LLSD.undefined;
    final ch = String.fromCharCode(peek());

    if (ch == '!') {
      consume();
      return LLSD.undefined;
    }
    if (ch == 'T' || ch == 't') return _parseBoolWord(true);
    if (ch == 'F' || ch == 'f') return _parseBoolWord(false);
    if (ch == '1') {
      consume();
      return LLSD.boolVal(true);
    }
    if (ch == '0') {
      consume();
      return LLSD.boolVal(false);
    }
    if (ch == 'i') {
      consume();
      final word = _parseNumberWord();
      return LLSD.intVal(int.tryParse(word) ?? 0);
    }
    if (ch == 'r') {
      consume();
      final word = _parseNumberWord();
      if (word == 'nan') return LLSD.realVal(double.nan);
      if (word == 'inf' || word == '+inf' || word == 'infinity') return LLSD.realVal(double.infinity);
      if (word == '-inf' || word == '-infinity') return LLSD.realVal(double.negativeInfinity);
      return LLSD.realVal(double.tryParse(word) ?? 0.0);
    }
    if (ch == 'u') {
      consume();
      final uuidStr = _parseUuidLiteral();
      return LLSD.uuidVal(LLUUID.fromString(uuidStr));
    }
    if (ch == 'd') {
      consume();
      final qStr = _parseQuotedAfterTag();
      return LLSD.dateVal(LLDate.fromISOString(qStr));
    }
    if (ch == 'l') {
      consume();
      final qStr = _parseQuotedAfterTag();
      return LLSD.uriVal(LLURI(qStr));
    }
    if (ch == 'b') return _parseBinaryNotation();
    if (ch == 's') return _parseSizedString();
    if (ch == "'") return LLSD.stringVal(_parseSingleQuoted());
    if (ch == '"') return LLSD.stringVal(_parseDoubleQuoted());
    if (ch == '{') return _parseMap();
    if (ch == '[') return _parseArray();

    consume();
    return LLSD.undefined;
  }

  LLSD _parseBoolWord(bool expected) {
    final word = expected ? 'true' : 'false';
    var matched = true;
    for (var i = 0; i < word.length; i++) {
      final code = peekAt(i);
      if (code == 0 || String.fromCharCode(code).toLowerCase() != word[i].toLowerCase()) {
        matched = false;
        break;
      }
    }
    if (matched) {
      pos += word.length;
    } else {
      consume();
    }
    return LLSD.boolVal(expected);
  }

  String _parseNumberWord() {
    final start = pos;
    while (pos < text.length) {
      final code = text.codeUnitAt(pos);
      if (_isWs(code) || code == 44 /*,*/ || code == 125 /*}*/ || code == 93 /*]*/) {
        break;
      }
      pos++;
    }
    return text.substring(start, pos);
  }

  String _parseUuidLiteral() {
    final start = pos;
    final end = (start + 36 <= text.length) ? start + 36 : text.length;
    pos = end;
    return text.substring(start, end);
  }

  String _parseQuotedAfterTag() {
    skipWs();
    final ch = String.fromCharCode(peek());
    if (ch == '"') return _parseDoubleQuoted();
    if (ch == "'") return _parseSingleQuoted();
    return '';
  }

  String _parseDoubleQuoted() {
    if (String.fromCharCode(peek()) != '"') return '';
    consume();
    final sb = StringBuffer();
    while (pos < text.length && String.fromCharCode(peek()) != '"') {
      if (String.fromCharCode(peek()) == '\\' && pos + 1 < text.length) {
        consume();
        sb.write(_decodeEscape(consume()));
      } else {
        sb.write(String.fromCharCode(consume()));
      }
    }
    if (pos < text.length) consume();
    return sb.toString();
  }

  String _parseSingleQuoted() {
    if (String.fromCharCode(peek()) != "'") return '';
    consume();
    final sb = StringBuffer();
    while (pos < text.length && String.fromCharCode(peek()) != "'") {
      if (String.fromCharCode(peek()) == '\\' && pos + 1 < text.length) {
        consume();
        sb.write(_decodeEscape(consume()));
      } else {
        sb.write(String.fromCharCode(consume()));
      }
    }
    if (pos < text.length) consume();
    return sb.toString();
  }

  String _decodeEscape(int code) {
    final ch = String.fromCharCode(code);
    switch (ch) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      default: return ch;
    }
  }

  LLSD _parseSizedString() {
    consume(); // 's'
    if (String.fromCharCode(peek()) == '(') {
      consume();
      final start = pos;
      while (pos < text.length && String.fromCharCode(peek()) != ')') pos++;
      final size = int.tryParse(text.substring(start, pos)) ?? 0;
      if (pos < text.length) consume(); // ')'
      if (pos < text.length && (String.fromCharCode(peek()) == '"' || String.fromCharCode(peek()) == "'")) {
        consume();
      }
      final end = (pos + size <= text.length) ? pos + size : text.length;
      final str = text.substring(pos, end);
      pos = end;
      if (pos < text.length && (String.fromCharCode(peek()) == '"' || String.fromCharCode(peek()) == "'")) {
        consume();
      }
      return LLSD.stringVal(str);
    }
    if (String.fromCharCode(peek()) == '"') return LLSD.stringVal(_parseDoubleQuoted());
    if (String.fromCharCode(peek()) == "'") return LLSD.stringVal(_parseSingleQuoted());
    return LLSD.stringVal('');
  }

  LLSD _parseBinaryNotation() {
    consume(); // 'b'
    final p0 = String.fromCharCode(peekAt(0));
    final p1 = String.fromCharCode(peekAt(1));

    if (p0 == '6' && p1 == '4') {
      pos += 2;
      final dataStr = _parseQuotedAfterTag();
      try {
        return LLSD.binaryVal(base64Decode(dataStr));
      } catch (_) {
        return LLSD.binaryVal(Uint8List(0));
      }
    }
    if (p0 == '1' && p1 == '6') {
      pos += 2;
      final hexStr = _parseQuotedAfterTag();
      return LLSD.binaryVal(_hexDecode(hexStr));
    }
    if (p0 == '(') {
      consume(); // '('
      final start = pos;
      while (pos < text.length && String.fromCharCode(peek()) != ')') pos++;
      final size = int.tryParse(text.substring(start, pos)) ?? 0;
      if (pos < text.length) consume(); // ')'
      if (pos < text.length && (String.fromCharCode(peek()) == '"' || String.fromCharCode(peek()) == "'")) {
        consume();
      }
      final end = (pos + size <= text.length) ? pos + size : text.length;
      final bytes = Uint8List(end - pos);
      for (var i = 0; i < bytes.length; i++) {
        bytes[i] = text.codeUnitAt(pos + i);
      }
      pos = end;
      if (pos < text.length && (String.fromCharCode(peek()) == '"' || String.fromCharCode(peek()) == "'")) {
        consume();
      }
      return LLSD.binaryVal(bytes);
    }
    return LLSD.binaryVal(Uint8List(0));
  }

  Uint8List _hexDecode(String hex) {
    final clean = hex.replaceAll(RegExp(r'\s+'), '');
    final bytes = Uint8List(clean.length ~/ 2);
    for (var i = 0; i < bytes.length; i++) {
      bytes[i] = int.parse(clean.substring(i * 2, i * 2 + 2), radix: 16);
    }
    return bytes;
  }

  LLSD _parseMap() {
    consume(); // '{'
    final map = <String, LLSD>{};
    skipWs();
    while (pos < text.length && String.fromCharCode(peek()) != '}') {
      skipWs();
      if (String.fromCharCode(peek()) == '}') break;
      final ch = String.fromCharCode(peek());
      String key = '';
      if (ch == "'") {
        key = _parseSingleQuoted();
      } else if (ch == '"') {
        key = _parseDoubleQuoted();
      } else if (ch == 's') {
        key = _parseSizedString().asString();
      } else {
        key = _parseNumberWord();
      }
      skipWs();
      if (String.fromCharCode(peek()) == ':') consume();
      skipWs();
      final val = parseValue();
      map[key] = val;
      skipWs();
      if (String.fromCharCode(peek()) == ',') consume();
      skipWs();
    }
    if (pos < text.length && String.fromCharCode(peek()) == '}') consume();
    return LLSD.mapVal(map);
  }

  LLSD _parseArray() {
    consume(); // '['
    final list = <LLSD>[];
    skipWs();
    while (pos < text.length && String.fromCharCode(peek()) != ']') {
      skipWs();
      if (String.fromCharCode(peek()) == ']') break;
      final val = parseValue();
      list.add(val);
      skipWs();
      if (String.fromCharCode(peek()) == ',') consume();
      skipWs();
    }
    if (pos < text.length && String.fromCharCode(peek()) == ']') consume();
    return LLSD.arrayVal(list);
  }
}
