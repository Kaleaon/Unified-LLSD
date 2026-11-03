import 'dart:convert';
import 'dart:typed_data';

import 'llsd.dart';
import 'lluuid.dart';
import 'lldate.dart';
import 'lluri.dart';

class LLSDSerialize {
  static const String binaryHeader = "<?llsd/binary?>\n";
  static const String notationHeader = "<?llsd/notation?>\n";
  static const String xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';

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
        sb.write('<undef />');
        break;
      case LLSDType.boolean:
        sb.write('<boolean>${sd.asBoolean() ? "true" : "false"}</boolean>');
        break;
      case LLSDType.integer:
        sb.write('<integer>${sd.asInt()}</integer>');
        break;
      case LLSDType.real:
        final r = sd.asReal();
        if (r.isNaN) {
          sb.write('<real>nan</real>');
        } else if (r.isInfinite) {
          sb.write('<real>${r > 0 ? "inf" : "-inf"}</real>');
        } else {
          sb.write('<real>$r</real>');
        }
        break;
      case LLSDType.string:
        final s = sd.asString();
        if (s.isEmpty) {
          sb.write('<string />');
        } else {
          sb.write('<string>${_xmlEscape(s)}</string>');
        }
        break;
      case LLSDType.uuid:
        sb.write('<uuid>${sd.asUUID()}</uuid>');
        break;
      case LLSDType.date:
        sb.write('<date>${sd.asDate().toISOString()}</date>');
        break;
      case LLSDType.uri:
        final uriStr = sd.asURI().asString();
        if (uriStr.isEmpty) {
          sb.write('<uri />');
        } else {
          sb.write('<uri>${_xmlEscape(uriStr)}</uri>');
        }
        break;
      case LLSDType.binary:
        final bytes = sd.asBinary();
        if (bytes.isEmpty) {
          sb.write('<binary encoding="base64" />');
        } else {
          sb.write('<binary encoding="base64">${base64Encode(bytes)}</binary>');
        }
        break;
      case LLSDType.map:
        final m = sd.asMap();
        if (m.isEmpty) {
          sb.write('<map />');
        } else {
          sb.write('<map>');
          for (final entry in m.entries) {
            sb.write('<key>${_xmlEscape(entry.key)}</key>');
            _writeXmlElement(sb, entry.value);
          }
          sb.write('</map>');
        }
        break;
      case LLSDType.array:
        final a = sd.asArray();
        if (a.isEmpty) {
          sb.write('<array />');
        } else {
          sb.write('<array>');
          for (final item in a) {
            _writeXmlElement(sb, item);
          }
          sb.write('</array>');
        }
        break;
    }
  }

  static String _xmlEscape(String s) {
    return s
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
  }

  static LLSD fromXML(String xml) {
    return _XmlParser(xml).parse();
  }

  // --- Binary ---
  static Uint8List toBinary(LLSD sd) {
    final builder = BytesBuilder();
    builder.add(utf8.encode(binaryHeader));
    _writeBinary(builder, sd);
    return builder.toBytes();
  }

  static void _writeBinary(BytesBuilder bb, LLSD sd) {
    final bd = ByteData(8);
    switch (sd.type) {
      case LLSDType.undefined:
        bb.addByte(33); // '!'
        break;
      case LLSDType.boolean:
        bb.addByte(sd.asBoolean() ? 49 : 48); // '1' or '0'
        break;
      case LLSDType.integer:
        bb.addByte(105); // 'i'
        bd.setInt32(0, sd.asInt(), Endian.big);
        bb.add(bd.buffer.asUint8List(0, 4));
        break;
      case LLSDType.real:
        bb.addByte(114); // 'r'
        bd.setFloat64(0, sd.asReal(), Endian.big);
        bb.add(bd.buffer.asUint8List(0, 8));
        break;
      case LLSDType.string:
        bb.addByte(115); // 's'
        final bytes = utf8.encode(sd.asString());
        bd.setUint32(0, bytes.length, Endian.big);
        bb.add(bd.buffer.asUint8List(0, 4));
        bb.add(bytes);
        break;
      case LLSDType.uuid:
        bb.addByte(117); // 'u'
        bb.add(sd.asUUID().bytes);
        break;
      case LLSDType.date:
        bb.addByte(100); // 'd'
        bd.setFloat64(0, sd.asDate().secondsSinceEpoch, Endian.little);
        bb.add(bd.buffer.asUint8List(0, 8));
        break;
      case LLSDType.uri:
        bb.addByte(108); // 'l'
        final bytes = utf8.encode(sd.asURI().asString());
        bd.setUint32(0, bytes.length, Endian.big);
        bb.add(bd.buffer.asUint8List(0, 4));
        bb.add(bytes);
        break;
      case LLSDType.binary:
        bb.addByte(98); // 'b'
        final bytes = sd.asBinary();
        bd.setUint32(0, bytes.length, Endian.big);
        bb.add(bd.buffer.asUint8List(0, 4));
        bb.add(bytes);
        break;
      case LLSDType.map:
        bb.addByte(123); // '{'
        final m = sd.asMap();
        bd.setUint32(0, m.length, Endian.big);
        bb.add(bd.buffer.asUint8List(0, 4));
        for (final entry in m.entries) {
          bb.addByte(107); // 'k'
          final keyBytes = utf8.encode(entry.key);
          bd.setUint32(0, keyBytes.length, Endian.big);
          bb.add(bd.buffer.asUint8List(0, 4));
          bb.add(keyBytes);
          _writeBinary(bb, entry.value);
        }
        bb.addByte(125); // '}'
        break;
      case LLSDType.array:
        bb.addByte(91); // '['
        final a = sd.asArray();
        bd.setUint32(0, a.length, Endian.big);
        bb.add(bd.buffer.asUint8List(0, 4));
        for (final item in a) {
          _writeBinary(bb, item);
        }
        bb.addByte(93); // ']'
        break;
    }
  }

  static LLSD fromBinary(Uint8List bytes) {
    return _BinaryParser(bytes).parse();
  }

  // --- Notation ---
  static String toNotation(LLSD sd) {
    final sb = StringBuffer();
    _writeNotation(sb, sd);
    return sb.toString();
  }

  static void _writeNotation(StringBuffer sb, LLSD sd) {
    switch (sd.type) {
      case LLSDType.undefined:
        sb.write('!');
        break;
      case LLSDType.boolean:
        sb.write(sd.asBoolean() ? 'true' : 'false');
        break;
      case LLSDType.integer:
        sb.write('i${sd.asInt()}');
        break;
      case LLSDType.real:
        final r = sd.asReal();
        if (r.isNaN) {
          sb.write('rnan');
        } else if (r.isInfinite) {
          sb.write(r > 0 ? 'rinf' : '-rinf');
        } else {
          sb.write('r$r');
        }
        break;
      case LLSDType.string:
        final s = sd.asString();
        sb.write("'${s.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'");
        break;
      case LLSDType.uuid:
        sb.write('u${sd.asUUID()}');
        break;
      case LLSDType.date:
        sb.write('d"${sd.asDate().toISOString()}"');
        break;
      case LLSDType.uri:
        sb.write('l"${sd.asURI().asString()}"');
        break;
      case LLSDType.binary:
        sb.write('b64"${base64Encode(sd.asBinary())}"');
        break;
      case LLSDType.map:
        sb.write('{');
        final m = sd.asMap();
        var first = true;
        for (final entry in m.entries) {
          if (!first) sb.write(',');
          first = false;
          sb.write(
              "'${entry.key.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}':");
          _writeNotation(sb, entry.value);
        }
        sb.write('}');
        break;
      case LLSDType.array:
        sb.write('[');
        final a = sd.asArray();
        for (var i = 0; i < a.length; i++) {
          if (i > 0) sb.write(',');
          _writeNotation(sb, a[i]);
        }
        sb.write(']');
        break;
    }
  }

  static LLSD fromNotation(String text) {
    return _NotationParser(text).parse();
  }
}

class _XmlParser {
  final String source;
  int pos = 0;

  _XmlParser(this.source);

  void _skipWhitespaceAndComments() {
    while (pos < source.length) {
      final ch = source.codeUnitAt(pos);
      if (ch <= 32) {
        pos++;
        continue;
      }
      if (source.startsWith('<?', pos)) {
        final end = source.indexOf('?>', pos);
        if (end != -1) {
          pos = end + 2;
          continue;
        }
      }
      if (source.startsWith('<!--', pos)) {
        final end = source.indexOf('-->', pos);
        if (end != -1) {
          pos = end + 3;
          continue;
        }
      }
      break;
    }
  }

  LLSD parse() {
    _skipWhitespaceAndComments();
    if (pos >= source.length) return LLSD.undefined;

    if (source.startsWith('<llsd>', pos) || source.startsWith('<LLSD>', pos)) {
      pos += 6;
      final val = _parseElement();
      _skipWhitespaceAndComments();
      if (source.startsWith('</llsd>', pos) ||
          source.startsWith('</LLSD>', pos)) {
        pos += 7;
      }
      return val;
    }

    return _parseElement();
  }

  LLSD _parseElement() {
    _skipWhitespaceAndComments();
    if (pos >= source.length) return LLSD.undefined;

    if (source[pos] != '<') return LLSD.undefined;

    final tagStart = pos;
    final tagEnd = source.indexOf('>', tagStart);
    if (tagEnd == -1) return LLSD.undefined;

    final rawTag = source.substring(tagStart + 1, tagEnd).trim();
    final isSelfClosing = rawTag.endsWith('/');
    var cleanTag =
        isSelfClosing ? rawTag.substring(0, rawTag.length - 1).trim() : rawTag;

    var tagName = cleanTag;
    final spaceIdx = cleanTag.indexOf(' ');
    if (spaceIdx != -1) {
      tagName = cleanTag.substring(0, spaceIdx).trim();
    }
    tagName = tagName.toLowerCase();

    pos = tagEnd + 1;

    if (isSelfClosing || tagName == 'undef') {
      switch (tagName) {
        case 'boolean':
          return LLSD.boolVal(false);
        case 'integer':
          return LLSD.intVal(0);
        case 'real':
          return LLSD.realVal(0.0);
        case 'uuid':
          return LLSD.uuidVal(LLUUID.nullUuid);
        case 'string':
          return LLSD.stringVal('');
        case 'uri':
          return LLSD.uriVal(LLURI(''));
        case 'binary':
          return LLSD.binaryVal(Uint8List(0));
        case 'date':
          return LLSD.dateVal(LLDate(0.0));
        case 'map':
          return LLSD.mapVal({});
        case 'array':
          return LLSD.arrayVal([]);
        default:
          return LLSD.undefined;
      }
    }

    if (tagName == 'map') {
      return _parseMap();
    }
    if (tagName == 'array') {
      return _parseArray();
    }

    final closeTag = '</$tagName>';
    final closePos = source.toLowerCase().indexOf(closeTag, pos);
    var content = '';
    if (closePos != -1) {
      content = source.substring(pos, closePos);
      pos = closePos + closeTag.length;
    } else {
      content = source.substring(pos);
      pos = source.length;
    }

    switch (tagName) {
      case 'boolean':
        final c = content.trim().toLowerCase();
        return LLSD.boolVal(c == 'true' || c == '1' || c == 't');
      case 'integer':
        final c = content.trim();
        return LLSD.intVal(int.tryParse(c) ?? 0);
      case 'real':
        final c = content.trim().toLowerCase();
        if (c == 'nan') return LLSD.realVal(double.nan);
        if (c == 'inf' || c == '+inf') return LLSD.realVal(double.infinity);
        if (c == '-inf') return LLSD.realVal(double.negativeInfinity);
        return LLSD.realVal(double.tryParse(c) ?? 0.0);
      case 'uuid':
        final c = content.trim();
        return LLSD.uuidVal(c.isEmpty ? LLUUID.nullUuid : LLUUID.fromString(c));
      case 'string':
        return LLSD.stringVal(_unescapeXml(content));
      case 'date':
        final c = content.trim();
        return LLSD.dateVal(LLDate.fromISOString(c));
      case 'uri':
        return LLSD.uriVal(LLURI(_unescapeXml(content.trim())));
      case 'binary':
        final c = content.trim().replaceAll(RegExp(r'\s+'), '');
        try {
          return LLSD.binaryVal(c.isEmpty ? Uint8List(0) : base64Decode(c));
        } catch (_) {
          return LLSD.binaryVal(Uint8List(0));
        }
      default:
        return LLSD.undefined;
    }
  }

  LLSD _parseMap() {
    final map = <String, LLSD>{};
    while (pos < source.length) {
      _skipWhitespaceAndComments();
      if (source.startsWith('</map>', pos) ||
          source.startsWith('</MAP>', pos)) {
        pos += 6;
        break;
      }
      final keyStart = source.toLowerCase().indexOf('<key>', pos);
      final mapClose = source.toLowerCase().indexOf('</map>', pos);

      if (keyStart == -1 || (mapClose != -1 && mapClose < keyStart)) {
        if (mapClose != -1) pos = mapClose + 6;
        break;
      }

      final keyEnd = source.toLowerCase().indexOf('</key>', keyStart);
      if (keyEnd == -1) break;

      final rawKey = source.substring(keyStart + 5, keyEnd);
      final key = _unescapeXml(rawKey.trim());
      pos = keyEnd + 6;

      final val = _parseElement();
      map[key] = val;
    }
    return LLSD.mapVal(map);
  }

  LLSD _parseArray() {
    final list = <LLSD>[];
    while (pos < source.length) {
      _skipWhitespaceAndComments();
      if (source.startsWith('</array>', pos) ||
          source.startsWith('</ARRAY>', pos)) {
        pos += 8;
        break;
      }
      if (source.startsWith('</', pos)) {
        break;
      }
      final val = _parseElement();
      if (val.isUndefined && pos >= source.length) break;
      list.add(val);
    }
    return LLSD.arrayVal(list);
  }

  static String _unescapeXml(String s) {
    return s
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'")
        .replaceAll('&amp;', '&');
  }
}

class _BinaryParser {
  final Uint8List bytes;
  int pos = 0;
  late final ByteData view;

  _BinaryParser(this.bytes) {
    view = ByteData.sublistView(bytes);
    const header = '<?llsd/binary?>';
    if (bytes.length >= header.length) {
      final h = String.fromCharCodes(bytes.sublist(0, header.length));
      if (h == header) {
        pos = header.length;
        if (pos < bytes.length && bytes[pos] == 13) pos++; // '\r'
        if (pos < bytes.length && bytes[pos] == 10) pos++; // '\n'
      }
    }
  }

  LLSD parse() {
    return _parseValue();
  }

  LLSD _parseValue() {
    if (pos >= bytes.length) return LLSD.undefined;

    final marker = bytes[pos++];
    switch (marker) {
      case 33: // '!'
        return LLSD.undefined;
      case 48: // '0'
      case 102: // 'f'
      case 70: // 'F'
        return LLSD.boolVal(false);
      case 49: // '1'
      case 116: // 't'
      case 84: // 'T'
        return LLSD.boolVal(true);
      case 105: // 'i'
        if (pos + 4 > bytes.length) return LLSD.undefined;
        final val = view.getInt32(pos, Endian.big);
        pos += 4;
        return LLSD.intVal(val);
      case 114: // 'r'
        if (pos + 8 > bytes.length) return LLSD.undefined;
        final val = view.getFloat64(pos, Endian.big);
        pos += 8;
        return LLSD.realVal(val);
      case 117: // 'u'
        if (pos + 16 > bytes.length) return LLSD.undefined;
        final uuidBytes = bytes.sublist(pos, pos + 16);
        pos += 16;
        return LLSD.uuidVal(LLUUID.fromBytes(uuidBytes));
      case 115: // 's'
        if (pos + 4 > bytes.length) return LLSD.undefined;
        final len = view.getUint32(pos, Endian.big);
        pos += 4;
        if (pos + len > bytes.length) return LLSD.undefined;
        final strBytes = bytes.sublist(pos, pos + len);
        pos += len;
        return LLSD.stringVal(utf8.decode(strBytes));
      case 100: // 'd'
        if (pos + 8 > bytes.length) return LLSD.undefined;
        final seconds = view.getFloat64(pos, Endian.little);
        pos += 8;
        return LLSD.dateVal(LLDate(seconds));
      case 108: // 'l'
        if (pos + 4 > bytes.length) return LLSD.undefined;
        final len = view.getUint32(pos, Endian.big);
        pos += 4;
        if (pos + len > bytes.length) return LLSD.undefined;
        final uriBytes = bytes.sublist(pos, pos + len);
        pos += len;
        return LLSD.uriVal(LLURI(utf8.decode(uriBytes)));
      case 98: // 'b'
        if (pos + 4 > bytes.length) return LLSD.undefined;
        final len = view.getUint32(pos, Endian.big);
        pos += 4;
        if (pos + len > bytes.length) return LLSD.undefined;
        final binBytes = bytes.sublist(pos, pos + len);
        pos += len;
        return LLSD.binaryVal(binBytes);
      case 123: // '{'
        if (pos + 4 > bytes.length) return LLSD.undefined;
        final count = view.getUint32(pos, Endian.big);
        pos += 4;
        final map = <String, LLSD>{};
        for (var i = 0; i < count; i++) {
          if (pos >= bytes.length) break;
          if (bytes[pos] == 107) pos++; // 'k'
          if (pos + 4 > bytes.length) break;
          final keyLen = view.getUint32(pos, Endian.big);
          pos += 4;
          if (pos + keyLen > bytes.length) break;
          final key = utf8.decode(bytes.sublist(pos, pos + keyLen));
          pos += keyLen;
          final val = _parseValue();
          map[key] = val;
        }
        if (pos < bytes.length && bytes[pos] == 125) pos++; // '}'
        return LLSD.mapVal(map);
      case 91: // '['
        if (pos + 4 > bytes.length) return LLSD.undefined;
        final count = view.getUint32(pos, Endian.big);
        pos += 4;
        final list = <LLSD>[];
        for (var i = 0; i < count; i++) {
          if (pos >= bytes.length) break;
          list.add(_parseValue());
        }
        if (pos < bytes.length && bytes[pos] == 93) pos++; // ']'
        return LLSD.arrayVal(list);
      default:
        return LLSD.undefined;
    }
  }
}

class _NotationParser {
  final String source;
  int pos = 0;

  _NotationParser(this.source);

  void _skipWhitespaceAndComments() {
    while (pos < source.length) {
      final ch = source.codeUnitAt(pos);
      if (ch <= 32 || ch == 44) {
        // whitespace or comma
        pos++;
        continue;
      }
      if (source.startsWith('<?', pos)) {
        final end = source.indexOf('?>', pos);
        if (end != -1) {
          pos = end + 2;
          continue;
        }
      }
      break;
    }
  }

  LLSD parse() {
    _skipWhitespaceAndComments();
    if (pos >= source.length) return LLSD.undefined;
    return _parseValue();
  }

  LLSD _parseValue() {
    _skipWhitespaceAndComments();
    if (pos >= source.length) return LLSD.undefined;

    final ch = source[pos];

    if (ch == '!') {
      pos++;
      return LLSD.undefined;
    }

    if (source.startsWith('true', pos)) {
      pos += 4;
      return LLSD.boolVal(true);
    }
    if (source.startsWith('false', pos)) {
      pos += 5;
      return LLSD.boolVal(false);
    }

    if (ch == 'i') {
      pos++;
      final start = pos;
      if (pos < source.length && (source[pos] == '-' || source[pos] == '+'))
        pos++;
      while (pos < source.length && _isDigit(source[pos])) pos++;
      final numStr = source.substring(start, pos);
      return LLSD.intVal(int.tryParse(numStr) ?? 0);
    }

    if (ch == 'r') {
      pos++;
      if (source.startsWith('nan', pos)) {
        pos += 3;
        return LLSD.realVal(double.nan);
      }
      if (source.startsWith('inf', pos)) {
        pos += 3;
        return LLSD.realVal(double.infinity);
      }
      final start = pos;
      if (pos < source.length && (source[pos] == '-' || source[pos] == '+'))
        pos++;
      while (pos < source.length &&
          (_isDigit(source[pos]) ||
              source[pos] == '.' ||
              source[pos] == 'e' ||
              source[pos] == 'E' ||
              source[pos] == '+' ||
              source[pos] == '-')) {
        pos++;
      }
      final numStr = source.substring(start, pos);
      return LLSD.realVal(double.tryParse(numStr) ?? 0.0);
    }

    if (source.startsWith('-rinf', pos)) {
      pos += 5;
      return LLSD.realVal(double.negativeInfinity);
    }

    if (ch == 'u') {
      pos++;
      if (pos + 36 <= source.length) {
        final uuidStr = source.substring(pos, pos + 36);
        pos += 36;
        return LLSD.uuidVal(LLUUID.fromString(uuidStr));
      }
    }

    if (ch == 'd') {
      pos++;
      _skipWhitespaceAndComments();
      if (pos < source.length && source[pos] == '"') {
        final str = _parseQuotedString('"');
        return LLSD.dateVal(LLDate.fromISOString(str));
      }
    }

    if (ch == 'l') {
      pos++;
      _skipWhitespaceAndComments();
      if (pos < source.length && source[pos] == '"') {
        final str = _parseQuotedString('"');
        return LLSD.uriVal(LLURI(str));
      }
    }

    if (ch == 'b') {
      if (source.startsWith('b64', pos)) {
        pos += 3;
        _skipWhitespaceAndComments();
        if (pos < source.length && source[pos] == '"') {
          final str = _parseQuotedString('"');
          try {
            return LLSD.binaryVal(base64Decode(str));
          } catch (_) {
            return LLSD.binaryVal(Uint8List(0));
          }
        }
      }
    }

    if (ch == "'" || ch == '"') {
      final str = _parseQuotedString(ch);
      return LLSD.stringVal(str);
    }

    if (ch == 's') {
      pos++;
      if (pos < source.length && source[pos] == '(') {
        final closeParen = source.indexOf(')', pos);
        if (closeParen != -1) {
          final len = int.tryParse(source.substring(pos + 1, closeParen)) ?? 0;
          pos = closeParen + 1;
          if (pos < source.length &&
              (source[pos] == '"' || source[pos] == "'")) {
            final q = source[pos];
            pos++;
            final strBytes = utf8.encode(source.substring(pos));
            final resStr = utf8.decode(strBytes.sublist(0, len));
            pos += len + 1;
            return LLSD.stringVal(resStr);
          }
        }
      }
      _skipWhitespaceAndComments();
      if (pos < source.length && (source[pos] == '"' || source[pos] == "'")) {
        final str = _parseQuotedString(source[pos]);
        return LLSD.stringVal(str);
      }
    }

    if (ch == '{') {
      pos++; // '{'
      final map = <String, LLSD>{};
      while (pos < source.length) {
        _skipWhitespaceAndComments();
        if (pos < source.length && source[pos] == '}') {
          pos++;
          break;
        }
        final keyStr = _parseKey();
        if (keyStr == null) break;
        _skipWhitespaceAndComments();
        if (pos < source.length && source[pos] == ':') pos++;
        final val = _parseValue();
        map[keyStr] = val;
      }
      return LLSD.mapVal(map);
    }

    if (ch == '[') {
      pos++; // '['
      final list = <LLSD>[];
      while (pos < source.length) {
        _skipWhitespaceAndComments();
        if (pos < source.length && source[pos] == ']') {
          pos++;
          break;
        }
        final val = _parseValue();
        list.add(val);
      }
      return LLSD.arrayVal(list);
    }

    return LLSD.undefined;
  }

  String? _parseKey() {
    _skipWhitespaceAndComments();
    if (pos >= source.length) return null;
    final ch = source[pos];
    if (ch == "'" || ch == '"') {
      return _parseQuotedString(ch);
    }
    final start = pos;
    while (pos < source.length) {
      final c = source[pos];
      if (c == ':' || c == '}' || source.codeUnitAt(pos) <= 32) break;
      pos++;
    }
    return source.substring(start, pos);
  }

  String _parseQuotedString(String quote) {
    pos++; // consume open quote
    final sb = StringBuffer();
    while (pos < source.length) {
      final ch = source[pos++];
      if (ch == quote) break;
      if (ch == '\\' && pos < source.length) {
        final next = source[pos++];
        if (next == 'n')
          sb.write('\n');
        else if (next == 'r')
          sb.write('\r');
        else if (next == 't')
          sb.write('\t');
        else
          sb.write(next);
      } else {
        sb.write(ch);
      }
    }
    return sb.toString();
  }

  bool _isDigit(String char) {
    final code = char.codeUnitAt(0);
    return code >= 48 && code <= 57;
  }
}
