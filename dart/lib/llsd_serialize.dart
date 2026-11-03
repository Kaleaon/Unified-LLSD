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
        final map = sd.asMap();
        for (final entry in map.entries) {
          sb.write('<key>${_xmlEscape(entry.key)}</key>');
          _writeXmlElement(sb, entry.value);
        }
        sb.write('</map>');
        break;
      case LLSDType.array:
        sb.write('<array>');
        final arr = sd.asArray();
        for (final item in arr) {
          _writeXmlElement(sb, item);
        }
        sb.write('</array>');
        break;
    }
  }

  static String _xmlEscape(String s) {
    return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  }

  static String _xmlUnescape(String s) {
    return s.replaceAll('&quot;', '"').replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&');
  }

  static LLSD fromXML(String xml) {
    var clean = xml.trim();
    if (clean.isEmpty) return LLSD.undefined;
    if (clean.startsWith('<?xml')) {
      final idx = clean.indexOf('?>');
      if (idx != -1) clean = clean.substring(idx + 2).trim();
    }
    if (clean.startsWith('<llsd>') && clean.endsWith('</llsd>')) {
      clean = clean.substring(6, clean.length - 7).trim();
    }
    return _parseXmlValue(clean);
  }

  static LLSD _parseXmlValue(String xml) {
    final clean = xml.trim();
    if (clean.isEmpty) return LLSD.undefined;

    if (clean.startsWith('<undef/>') || clean.startsWith('<undef />')) return LLSD.undefined;

    final boolMatch = RegExp(r'^<boolean\s*>(.*?)</boolean>', dotAll: true).firstMatch(clean);
    if (boolMatch != null) {
      final v = boolMatch.group(1)!.trim().toLowerCase();
      return LLSD.boolVal(v == 'true' || v == '1' || v == 't');
    }

    final intMatch = RegExp(r'^<integer\s*>(.*?)</integer>', dotAll: true).firstMatch(clean);
    if (intMatch != null) {
      return LLSD.intVal(int.parse(intMatch.group(1)!.trim()));
    }

    final realMatch = RegExp(r'^<real\s*>(.*?)</real>', dotAll: true).firstMatch(clean);
    if (realMatch != null) {
      final v = realMatch.group(1)!.trim().toLowerCase();
      if (v == 'nan') return LLSD.realVal(double.nan);
      if (v == 'inf' || v == '+inf' || v == 'infinity') return LLSD.realVal(double.infinity);
      if (v == '-inf' || v == '-infinity') return LLSD.realVal(double.negativeInfinity);
      return LLSD.realVal(double.parse(v));
    }

    if (clean.startsWith('<string/>') || clean.startsWith('<string />')) return LLSD.stringVal('');
    final strMatch = RegExp(r'^<string\s*>(.*?)</string>', dotAll: true).firstMatch(clean);
    if (strMatch != null) {
      return LLSD.stringVal(_xmlUnescape(strMatch.group(1)!));
    }

    if (clean.startsWith('<uuid/>') || clean.startsWith('<uuid />')) return LLSD.uuidVal(LLUUID.nullUuid);
    final uuidMatch = RegExp(r'^<uuid\s*>(.*?)</uuid>', dotAll: true).firstMatch(clean);
    if (uuidMatch != null) {
      return LLSD.uuidVal(LLUUID.fromString(uuidMatch.group(1)!.trim()));
    }

    final dateMatch = RegExp(r'^<date\s*>(.*?)</date>', dotAll: true).firstMatch(clean);
    if (dateMatch != null) {
      return LLSD.dateVal(LLDate.fromISOString(dateMatch.group(1)!.trim()));
    }

    final uriMatch = RegExp(r'^<uri\s*>(.*?)</uri>', dotAll: true).firstMatch(clean);
    if (uriMatch != null) {
      return LLSD.uriVal(LLURI(_xmlUnescape(uriMatch.group(1)!.trim())));
    }

    if (clean.startsWith('<binary/>') || clean.startsWith('<binary />')) return LLSD.binaryVal(Uint8List(0));
    final binMatch = RegExp(r'^<binary(?:\s+encoding="([^"]*)")?\s*>(.*?)</binary>', dotAll: true).firstMatch(clean);
    if (binMatch != null) {
      final encoding = (binMatch.group(1) ?? 'base64').toLowerCase();
      final content = binMatch.group(2)!.trim();
      if (encoding == 'base16') {
        final bytes = Uint8List(content.length ~/ 2);
        for (var i = 0; i < bytes.length; i++) {
          bytes[i] = int.parse(content.substring(i * 2, i * 2 + 2), radix: 16);
        }
        return LLSD.binaryVal(bytes);
      } else {
        return LLSD.binaryVal(base64Decode(content));
      }
    }

    if (clean.startsWith('<map>') || clean.startsWith('<map/>')) {
      if (clean.startsWith('<map/>')) return LLSD.mapVal({});
      final map = <String, LLSD>{};
      var inner = clean.substring(5, clean.lastIndexOf('</map>')).trim();
      while (inner.isNotEmpty) {
        final keyMatch = RegExp(r'^<key\s*>(.*?)</key>', dotAll: true).firstMatch(inner);
        if (keyMatch == null) break;
        final key = _xmlUnescape(keyMatch.group(1)!);
        inner = inner.substring(keyMatch.group(0)!.length).trim();
        final valueEndIdx = _findMatchingXmlEndTag(inner);
        if (valueEndIdx == -1) break;
        final valXml = inner.substring(0, valueEndIdx);
        map[key] = _parseXmlValue(valXml);
        inner = inner.substring(valueEndIdx).trim();
      }
      return LLSD.mapVal(map);
    }

    if (clean.startsWith('<array>') || clean.startsWith('<array/>')) {
      if (clean.startsWith('<array/>')) return LLSD.arrayVal([]);
      final arr = <LLSD>[];
      var inner = clean.substring(7, clean.lastIndexOf('</array>')).trim();
      while (inner.isNotEmpty) {
        final valueEndIdx = _findMatchingXmlEndTag(inner);
        if (valueEndIdx == -1) break;
        final valXml = inner.substring(0, valueEndIdx);
        arr.add(_parseXmlValue(valXml));
        inner = inner.substring(valueEndIdx).trim();
      }
      return LLSD.arrayVal(arr);
    }

    return LLSD.undefined;
  }

  static int _findMatchingXmlEndTag(String xml) {
    xml = xml.trimLeft();
    if (!xml.startsWith('<')) return -1;
    if (xml.startsWith('<?')) {
      final idx = xml.indexOf('?>');
      return idx != -1 ? idx + 2 : -1;
    }
    final spaceIdx = xml.indexOf(' ');
    final closeAngleIdx = xml.indexOf('>');
    if (closeAngleIdx == -1) return -1;
    var tagName = '';
    if (spaceIdx != -1 && spaceIdx < closeAngleIdx) {
      tagName = xml.substring(1, spaceIdx);
    } else {
      tagName = xml.substring(1, closeAngleIdx);
    }
    if (tagName.endsWith('/')) return closeAngleIdx + 1;
    if (xml.substring(0, closeAngleIdx + 1).endsWith('/>')) return closeAngleIdx + 1;

    final closingTag = '</$tagName>';
    var depth = 0;
    var pos = 0;

    while (pos < xml.length) {
      final nextOpen = xml.indexOf('<$tagName', pos);
      final nextClose = xml.indexOf(closingTag, pos);

      if (nextClose == -1) return -1;
      if (nextOpen != -1 && nextOpen < nextClose) {
        final endOpenAngle = xml.indexOf('>', nextOpen);
        if (endOpenAngle != -1 && xml[endOpenAngle - 1] == '/') {
          pos = endOpenAngle + 1;
        } else {
          depth++;
          pos = endOpenAngle + 1;
        }
      } else {
        depth--;
        pos = nextClose + closingTag.length;
        if (depth == 0) return pos;
      }
    }
    return -1;
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
        final map = sd.asMap();
        final bdata = ByteData(4)..setInt32(0, map.length, Endian.big);
        bb.add(bdata.buffer.asUint8List());
        for (final entry in map.entries) {
          bb.addByte(107); // 'k'
          final kbytes = utf8.encode(entry.key);
          final kbdata = ByteData(4)..setInt32(0, kbytes.length, Endian.big);
          bb.add(kbdata.buffer.asUint8List());
          bb.add(kbytes);
          _writeBinary(bb, entry.value);
        }
        bb.addByte(125); // '}'
        break;
      case LLSDType.array:
        bb.addByte(91); // '['
        final arr = sd.asArray();
        final bdata = ByteData(4)..setInt32(0, arr.length, Endian.big);
        bb.add(bdata.buffer.asUint8List());
        for (final item in arr) {
          _writeBinary(bb, item);
        }
        bb.addByte(93); // ']'
        break;
    }
  }

  static LLSD fromBinary(Uint8List bytes) {
    if (bytes.isEmpty) return LLSD.undefined;
    var offset = 0;
    if (bytes.length >= 2 && bytes[0] == 60 && bytes[1] == 63) { // '<?'
      for (var i = 0; i < bytes.length; i++) {
        if (bytes[i] == 10) { // '\n'
          offset = i + 1;
          break;
        }
      }
    }

    final res = _readBinaryValue(bytes, offset);
    return res.value;
  }

  static _ReadResult _readBinaryValue(Uint8List bytes, int offset) {
    if (offset >= bytes.length) return _ReadResult(LLSD.undefined, offset);
    final bd = ByteData.view(bytes.buffer, bytes.offsetInBytes, bytes.length);
    final tag = bytes[offset++];

    switch (tag) {
      case 33: // '!'
        return _ReadResult(LLSD.undefined, offset);
      case 49: // '1'
        return _ReadResult(LLSD.boolVal(true), offset);
      case 48: // '0'
        return _ReadResult(LLSD.boolVal(false), offset);
      case 105: // 'i'
        if (offset + 4 > bytes.length) return _ReadResult(LLSD.undefined, bytes.length);
        final v = bd.getInt32(offset, Endian.big);
        return _ReadResult(LLSD.intVal(v), offset + 4);
      case 114: // 'r'
        if (offset + 8 > bytes.length) return _ReadResult(LLSD.undefined, bytes.length);
        final v = bd.getFloat64(offset, Endian.big);
        return _ReadResult(LLSD.realVal(v), offset + 8);
      case 115: // 's'
        if (offset + 4 > bytes.length) return _ReadResult(LLSD.undefined, bytes.length);
        final len = bd.getInt32(offset, Endian.big);
        offset += 4;
        if (offset + len > bytes.length) return _ReadResult(LLSD.undefined, bytes.length);
        final str = utf8.decode(bytes.sublist(offset, offset + len));
        return _ReadResult(LLSD.stringVal(str), offset + len);
      case 117: // 'u'
        if (offset + 16 > bytes.length) return _ReadResult(LLSD.undefined, bytes.length);
        final uuidBytes = bytes.sublist(offset, offset + 16);
        return _ReadResult(LLSD.uuidVal(LLUUID(uuidBytes)), offset + 16);
      case 100: // 'd'
        if (offset + 8 > bytes.length) return _ReadResult(LLSD.undefined, bytes.length);
        final sec = bd.getFloat64(offset, Endian.little);
        return _ReadResult(LLSD.dateVal(LLDate(sec)), offset + 8);
      case 108: // 'l'
        if (offset + 4 > bytes.length) return _ReadResult(LLSD.undefined, bytes.length);
        final len = bd.getInt32(offset, Endian.big);
        offset += 4;
        if (offset + len > bytes.length) return _ReadResult(LLSD.undefined, bytes.length);
        final uriStr = utf8.decode(bytes.sublist(offset, offset + len));
        return _ReadResult(LLSD.uriVal(LLURI(uriStr)), offset + len);
      case 98: // 'b'
        if (offset + 4 > bytes.length) return _ReadResult(LLSD.undefined, bytes.length);
        final len = bd.getInt32(offset, Endian.big);
        offset += 4;
        if (offset + len > bytes.length) return _ReadResult(LLSD.undefined, bytes.length);
        final bin = Uint8List.fromList(bytes.sublist(offset, offset + len));
        return _ReadResult(LLSD.binaryVal(bin), offset + len);
      case 123: // '{'
        if (offset + 4 > bytes.length) return _ReadResult(LLSD.undefined, bytes.length);
        final count = bd.getInt32(offset, Endian.big);
        offset += 4;
        final map = <String, LLSD>{};

        for (var i = 0; i < count; i++) {
          if (offset >= bytes.length) break;
          final kTag = bytes[offset++];
          if (kTag != 107) { // 'k'
            return _ReadResult(LLSD.undefined, bytes.length);
          }
          if (offset + 4 > bytes.length) return _ReadResult(LLSD.undefined, bytes.length);
          final kLen = bd.getInt32(offset, Endian.big);
          offset += 4;
          if (offset + kLen > bytes.length) return _ReadResult(LLSD.undefined, bytes.length);
          final key = utf8.decode(bytes.sublist(offset, offset + kLen));
          offset += kLen;

          final valRes = _readBinaryValue(bytes, offset);
          map[key] = valRes.value;
          offset = valRes.offset;
        }

        if (offset < bytes.length && bytes[offset] == 125) { // '}'
          offset++;
        }
        return _ReadResult(LLSD.mapVal(map), offset);
      case 91: // '['
        if (offset + 4 > bytes.length) return _ReadResult(LLSD.undefined, bytes.length);
        final count = bd.getInt32(offset, Endian.big);
        offset += 4;
        final arr = <LLSD>[];

        for (var i = 0; i < count; i++) {
          final valRes = _readBinaryValue(bytes, offset);
          arr.add(valRes.value);
          offset = valRes.offset;
        }

        if (offset < bytes.length && bytes[offset] == 93) { // ']'
          offset++;
        }
        return _ReadResult(LLSD.arrayVal(arr), offset);
      default:
        return _ReadResult(LLSD.undefined, offset);
    }
  }

  // --- Notation ---
  static String toNotation(LLSD sd) {
    switch (sd.type) {
      case LLSDType.undefined: return '!';
      case LLSDType.boolean: return sd.asBoolean() ? 'true' : 'false';
      case LLSDType.integer: return 'i${sd.asInt()}';
      case LLSDType.real:
        final r = sd.asReal();
        if (r.isNaN) return 'rnan';
        if (r.isInfinite) return r > 0 ? 'rinf' : 'r-inf';
        return 'r$r';
      case LLSDType.string: return "'${_notationEscape(sd.asString())}'";
      case LLSDType.uuid: return 'u${sd.asUUID()}';
      case LLSDType.date: return 'd"${sd.asDate().toISOString()}"';
      case LLSDType.uri: return 'l"${_notationEscapeDouble(sd.asURI().asString())}"';
      case LLSDType.binary: return 'b64"${base64Encode(sd.asBinary())}"';
      case LLSDType.map:
        final map = sd.asMap();
        final parts = <String>[];
        for (final entry in map.entries) {
          parts.add("'${_notationEscape(entry.key)}':${toNotation(entry.value)}");
        }
        return '{${parts.join(',')}}';
      case LLSDType.array:
        final arr = sd.asArray();
        final parts = <String>[];
        for (final item in arr) {
          parts.add(toNotation(item));
        }
        return '[${parts.join(',')}]';
    }
  }

  static String _notationEscape(String s) {
    return s.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
  }

  static String _notationEscapeDouble(String s) {
    return s.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  }

  static LLSD fromNotation(String text) {
    if (text.isEmpty) return LLSD.undefined;
    var clean = text;
    if (clean.startsWith('<?llsd/notation?>') || clean.startsWith('<? llsd/notation ?>')) {
      final nl = clean.indexOf('\n');
      if (nl >= 0) clean = clean.substring(nl + 1);
    }
    return _NotationParser(clean).parse();
  }
}

class _ReadResult {
  final LLSD value;
  final int offset;
  _ReadResult(this.value, this.offset);
}

class _NotationParser {
  final String text;
  int pos = 0;

  _NotationParser(this.text);

  LLSD parse() {
    _skipWs();
    return _parseValue();
  }

  void _skipWs() {
    while (pos < text.length && text[pos].trim().isEmpty) {
      pos++;
    }
  }

  String _peek() => pos < text.length ? text[pos] : '';
  String _peekAt(int offset) => pos + offset < text.length ? text[pos + offset] : '';
  String _consume() => text[pos++];

  void _expect(String c) {
    if (pos >= text.length || text[pos] != c) {
      throw FormatException("Expected '$c' at pos $pos, found '${_peek()}'");
    }
    pos++;
  }

  LLSD _parseValue() {
    _skipWs();
    final c = _peek();

    if (c == '!') {
      _consume();
      return LLSD.undefined;
    }
    if (c == 'T' || c == 't') return _parseBoolWord(true);
    if (c == 'F' || c == 'f') return _parseBoolWord(false);
    if (c == '1') { _consume(); return LLSD.boolVal(true); }
    if (c == '0') { _consume(); return LLSD.boolVal(false); }
    if (c == 'i') {
      _consume();
      final numStr = _parseNumberWord();
      return LLSD.intVal(int.tryParse(numStr) ?? 0);
    }
    if (c == 'r') {
      _consume();
      final word = _parseNumberWord();
      final wLower = word.toLowerCase();
      if (wLower == 'nan') return LLSD.realVal(double.nan);
      if (wLower == 'inf' || wLower == '+inf') return LLSD.realVal(double.infinity);
      if (wLower == '-inf') return LLSD.realVal(double.negativeInfinity);
      return LLSD.realVal(double.tryParse(word) ?? 0.0);
    }
    if (c == 'u') {
      _consume();
      final uuidStr = _parseUuidLiteral();
      return LLSD.uuidVal(LLUUID.fromString(uuidStr));
    }
    if (c == 'd') {
      _consume();
      final str = _parseQuotedAfterTag();
      return LLSD.dateVal(LLDate.fromISOString(str));
    }
    if (c == 'l') {
      _consume();
      final str = _parseQuotedAfterTag();
      return LLSD.uriVal(LLURI(str));
    }
    if (c == 'b') return _parseBinaryNotation();
    if (c == 's') return _parseSizedString();
    if (c == "'") return LLSD.stringVal(_parseSingleQuoted());
    if (c == '"') return LLSD.stringVal(_parseDoubleQuoted());
    if (c == '{') return _parseMap();
    if (c == '[') return _parseArray();

    if (c.isNotEmpty) _consume();
    return LLSD.undefined;
  }

  LLSD _parseBoolWord(bool val) {
    final word = val ? 'true' : 'false';
    if (pos + word.length <= text.length) {
      final sub = text.substring(pos, pos + word.length);
      if (sub.toLowerCase() == word) {
        pos += word.length;
      } else {
        _consume();
      }
    } else {
      _consume();
    }
    return LLSD.boolVal(val);
  }

  String _parseNumberWord() {
    final start = pos;
    while (pos < text.length) {
      final c = text[pos];
      if (c.trim().isEmpty || c == ',' || c == '}' || c == ']') break;
      pos++;
    }
    return text.substring(start, pos);
  }

  String _parseUuidLiteral() {
    _skipWs();
    if (_peek() == '"') return _parseDoubleQuoted();
    if (_peek() == "'") return _parseSingleQuoted();
    final start = pos;
    final end = (start + 36 <= text.length) ? start + 36 : text.length;
    pos = end;
    return text.substring(start, end);
  }

  String _parseQuotedAfterTag() {
    _skipWs();
    if (_peek() == '"') return _parseDoubleQuoted();
    if (_peek() == "'") return _parseSingleQuoted();
    return '';
  }

  String _parseDoubleQuoted() {
    _expect('"');
    final sb = StringBuffer();
    while (pos < text.length && text[pos] != '"') {
      if (text[pos] == '\\' && pos + 1 < text.length) {
        pos++;
        sb.write(_decodeEscape(text[pos]));
      } else {
        sb.write(text[pos]);
      }
      pos++;
    }
    if (pos < text.length) pos++;
    return sb.toString();
  }

  String _parseSingleQuoted() {
    _expect("'");
    final sb = StringBuffer();
    while (pos < text.length && text[pos] != "'") {
      if (text[pos] == '\\' && pos + 1 < text.length) {
        pos++;
        sb.write(_decodeEscape(text[pos]));
      } else {
        sb.write(text[pos]);
      }
      pos++;
    }
    if (pos < text.length) pos++;
    return sb.toString();
  }

  String _decodeEscape(String c) {
    if (c == 'n') return '\n';
    if (c == 't') return '\t';
    if (c == 'r') return '\r';
    return c;
  }

  LLSD _parseSizedString() {
    _consume(); // 's'
    if (_peek() == '(') {
      _consume();
      final numStart = pos;
      while (pos < text.length && text[pos] != ')') pos++;
      final size = int.tryParse(text.substring(numStart, pos)) ?? 0;
      if (pos < text.length) _consume(); // ')'
      if (pos < text.length && (text[pos] == '"' || text[pos] == "'")) _consume();
      final end = (pos + size <= text.length) ? pos + size : text.length;
      final s = text.substring(pos, end);
      pos = end;
      if (pos < text.length && (text[pos] == '"' || text[pos] == "'")) _consume();
      return LLSD.stringVal(s);
    }
    if (_peek() == '"') return LLSD.stringVal(_parseDoubleQuoted());
    if (_peek() == "'") return LLSD.stringVal(_parseSingleQuoted());
    return LLSD.stringVal('');
  }

  LLSD _parseBinaryNotation() {
    _consume(); // 'b'
    if (_peekAt(0) == '6' && _peekAt(1) == '4') {
      pos += 2;
      final data = _parseQuotedAfterTag();
      return LLSD.binaryVal(base64Decode(data));
    }
    if (_peekAt(0) == '1' && _peekAt(1) == '6') {
      pos += 2;
      final data = _parseQuotedAfterTag();
      final bytes = Uint8List(data.length ~/ 2);
      for (var i = 0; i < bytes.length; i++) {
        bytes[i] = int.parse(data.substring(i * 2, i * 2 + 2), radix: 16);
      }
      return LLSD.binaryVal(bytes);
    }
    if (_peekAt(0) == '(') {
      _consume(); // '('
      final numStart = pos;
      while (pos < text.length && text[pos] != ')') pos++;
      final size = int.tryParse(text.substring(numStart, pos)) ?? 0;
      if (pos < text.length) _consume(); // ')'
      if (pos < text.length && (text[pos] == '"' || text[pos] == "'")) _consume();
      final end = (pos + size <= text.length) ? pos + size : text.length;
      final bytes = Uint8List(end - pos);
      for (var i = 0; i < bytes.length; i++) {
        bytes[i] = text.codeUnitAt(pos + i);
      }
      pos = end;
      if (pos < text.length && (text[pos] == '"' || text[pos] == "'")) _consume();
      return LLSD.binaryVal(bytes);
    }
    return LLSD.binaryVal(Uint8List(0));
  }

  LLSD _parseMap() {
    _consume(); // '{'
    final map = <String, LLSD>{};
    _skipWs();
    while (pos < text.length && _peek() != '}') {
      _skipWs();
      var key = '';
      final c = _peek();
      if (c == "'") key = _parseSingleQuoted();
      else if (c == '"') key = _parseDoubleQuoted();
      else if (c == 's') key = _parseSizedString().asString();
      else key = _parseNumberWord();

      _skipWs();
      if (_peek() == ':') _consume();
      _skipWs();
      map[key] = _parseValue();
      _skipWs();
      if (_peek() == ',') _consume();
      _skipWs();
    }
    if (pos < text.length) _consume(); // '}'
    return LLSD.mapVal(map);
  }

  LLSD _parseArray() {
    _consume(); // '['
    final arr = <LLSD>[];
    _skipWs();
    while (pos < text.length && _peek() != ']') {
      arr.add(_parseValue());
      _skipWs();
      if (_peek() == ',') _consume();
      _skipWs();
    }
    if (pos < text.length) _consume(); // ']'
    return LLSD.arrayVal(arr);
  }
}
