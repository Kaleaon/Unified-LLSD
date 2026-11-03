import 'dart:convert';
import 'dart:typed_data';

import 'llsd.dart';
import 'lluuid.dart';
import 'lldate.dart';
import 'lluri.dart';

enum LLSDFormat { xml, binary, notation }

class LLSDSerialize {
  static const String binaryHeader = "<? llsd/binary ?>\n";
  static const String notationHeader = "<? llsd/notation ?>\n";
  static const String xmlHeader = "<?xml version=\"1.0\" ?>\n";

  // --- Auto-Detection & General Parse ---
  static LLSD parse(Uint8List bytes) {
    if (bytes.isEmpty) return LLSD.undefined;
    final format = detectFormat(bytes);
    switch (format) {
      case LLSDFormat.binary:
        return fromBinary(bytes);
      case LLSDFormat.notation:
        return fromNotation(utf8.decode(bytes, allowMalformed: true));
      case LLSDFormat.xml:
        return fromXML(utf8.decode(bytes, allowMalformed: true));
    }
  }

  static LLSD parseString(String string) {
    final clean = string.trim();
    if (clean.startsWith('<? llsd/binary ?>') || clean.startsWith('<?llsd/binary?>')) {
      return fromBinary(Uint8List.fromList(utf8.encode(string)));
    }
    if (clean.startsWith('<? llsd/notation ?>') || clean.startsWith('<?llsd/notation?>')) {
      return fromNotation(string);
    }
    return fromXML(string);
  }

  static LLSDFormat detectFormat(Uint8List bytes) {
    if (bytes.length >= 2 && bytes[0] == 0x3c && bytes[1] == 0x3f) { // "<?"
      final prefix = utf8.decode(bytes.sublist(0, bytes.length < 64 ? bytes.length : 64), allowMalformed: true);
      if (prefix.contains('llsd/binary')) return LLSDFormat.binary;
      if (prefix.contains('llsd/notation')) return LLSDFormat.notation;
      if (prefix.contains('xml')) return LLSDFormat.xml;
    }
    if (bytes.isNotEmpty) {
      final tag = bytes[0];
      if (tag == 0x3c) return LLSDFormat.xml; // '<'
      if (tag == 0x21 || tag == 0x31 || tag == 0x30 || tag == 0x69 || tag == 0x72 ||
          tag == 0x73 || tag == 0x53 || tag == 0x75 || tag == 0x64 || tag == 0x6c ||
          tag == 0x62 || tag == 0x7b || tag == 0x5b) {
        return LLSDFormat.binary;
      }
    }
    return LLSDFormat.xml;
  }

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
          sb.write('<string/>');
        } else {
          sb.write('<string>${_xmlEscape(s)}</string>');
        }
        break;
      case LLSDType.uuid:
        final u = sd.asUUID();
        if (u.isNull) {
          sb.write('<uuid/>');
        } else {
          sb.write('<uuid>$u</uuid>');
        }
        break;
      case LLSDType.date:
        sb.write('<date>${sd.asDate().toISOString()}</date>');
        break;
      case LLSDType.uri:
        final u = sd.asURI().asString();
        if (u.isEmpty) {
          sb.write('<uri/>');
        } else {
          sb.write('<uri>${_xmlEscape(u)}</uri>');
        }
        break;
      case LLSDType.binary:
        final b = sd.asBinary();
        if (b.isEmpty) {
          sb.write('<binary encoding="base64"/>');
        } else {
          sb.write('<binary encoding="base64">${base64Encode(b)}</binary>');
        }
        break;
      case LLSDType.map:
        sb.write('<map>');
        for (final entry in sd.asMap().entries) {
          sb.write('<key>${_xmlEscape(entry.key)}</key>');
          _writeXmlElement(sb, entry.value);
        }
        sb.write('</map>');
        break;
      case LLSDType.array:
        sb.write('<array>');
        for (final item in sd.asArray()) {
          _writeXmlElement(sb, item);
        }
        sb.write('</array>');
        break;
    }
  }

  static String _xmlEscape(String s) {
    return s.replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&apos;');
  }

  static String _xmlUnescape(String s) {
    return s.replaceAll('&lt;', '<')
            .replaceAll('&gt;', '>')
            .replaceAll('&quot;', '"')
            .replaceAll('&apos;', "'")
            .replaceAll('&#39;', "'")
            .replaceAll('&amp;', '&');
  }

  static LLSD fromXML(String xml) {
    final clean = xml.trim();
    if (clean.isEmpty) return LLSD.undefined;
    final state = _XmlState(clean);
    return state.parseNode();
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
          final kBytes = utf8.encode(entry.key);
          final kdata = ByteData(4)..setInt32(0, kBytes.length, Endian.big);
          bb.add(kdata.buffer.asUint8List());
          bb.add(kBytes);
          _writeBinary(bb, entry.value);
        }
        bb.addByte(125); // '}'
        break;
      case LLSDType.array:
        bb.addByte(91); // '['
        final list = sd.asArray();
        final bdata = ByteData(4)..setInt32(0, list.length, Endian.big);
        bb.add(bdata.buffer.asUint8List());
        for (final item in list) {
          _writeBinary(bb, item);
        }
        bb.addByte(93); // ']'
        break;
    }
  }

  static LLSD fromBinary(Uint8List bytes) {
    if (bytes.isEmpty) return LLSD.undefined;
    var pos = 0;
    if (bytes.length >= 2 && bytes[0] == 0x3c && bytes[1] == 0x3f) { // "<? llsd/binary ?>\n"
      final newline = bytes.indexOf(0x0a);
      if (newline >= 0) pos = newline + 1;
    }
    final state = _BinaryState(bytes, pos);
    return state.readBinary();
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
        final s = sd.asString();
        final sb = StringBuffer("'");
        for (var i = 0; i < s.length; i++) {
          final c = s[i];
          if (c == "'" || c == '\\') sb.write('\\');
          sb.write(c);
        }
        sb.write("'");
        return sb.toString();
      case LLSDType.uuid:
        return 'u${sd.asUUID()}';
      case LLSDType.date:
        return 'd"${sd.asDate().toISOString()}"';
      case LLSDType.uri:
        return 'l"${sd.asURI().asString()}"';
      case LLSDType.binary:
        return 'b64"${base64Encode(sd.asBinary())}"';
      case LLSDType.map:
        final sb = StringBuffer('{');
        var first = true;
        for (final entry in sd.asMap().entries) {
          if (!first) sb.write(',');
          first = false;
          sb.write("'");
          for (var i = 0; i < entry.key.length; i++) {
            final c = entry.key[i];
            if (c == "'" || c == '\\') sb.write('\\');
            sb.write(c);
          }
          sb.write("':");
          sb.write(toNotation(entry.value));
        }
        sb.write('}');
        return sb.toString();
      case LLSDType.array:
        final sb = StringBuffer('[');
        var first = true;
        for (final item in sd.asArray()) {
          if (!first) sb.write(',');
          first = false;
          sb.write(toNotation(item));
        }
        sb.write(']');
        return sb.toString();
    }
  }

  static LLSD fromNotation(String text) {
    var clean = text.trim();
    if (clean.startsWith('<? llsd/notation ?>') || clean.startsWith('<?llsd/notation?>')) {
      final nl = clean.indexOf('\n');
      if (nl >= 0) clean = clean.substring(nl + 1).trim();
    }
    final state = _NotationState(clean);
    return state.parseValue();
  }
}

class _XmlState {
  final String xml;
  int pos = 0;

  _XmlState(this.xml);

  void skipMisc() {
    while (pos < xml.length) {
      final c = xml[pos];
      if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
        pos++;
        continue;
      }
      if (xml.startsWith('<?', pos)) {
        final end = xml.indexOf('?>', pos);
        if (end >= 0) {
          pos = end + 2;
          continue;
        }
      }
      if (xml.startsWith('<!--', pos)) {
        final end = xml.indexOf('-->', pos);
        if (end >= 0) {
          pos = end + 4;
          continue;
        }
      }
      break;
    }
  }

  LLSD parseNode() {
    skipMisc();
    if (pos >= xml.length) return LLSD.undefined;

    if (xml[pos] != '<') return LLSD.undefined;
    final tagStart = pos + 1;
    final tagEnd = xml.indexOf('>', tagStart);
    if (tagEnd < 0) return LLSD.undefined;

    final tagHeader = xml.substring(tagStart, tagEnd).trim();
    final selfClosing = tagHeader.endsWith('/');
    final cleanHeader = selfClosing ? tagHeader.substring(0, tagHeader.length - 1).trim() : tagHeader;

    final parts = cleanHeader.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    final tagName = parts.isNotEmpty ? parts.first : '';

    pos = tagEnd + 1;

    if (tagName == 'llsd') {
      return parseNode();
    }
    if (tagName == 'undef') {
      return LLSD.undefined;
    }

    String content = '';
    if (!selfClosing) {
      final closeTag = '</$tagName>';
      final closePos = xml.indexOf(closeTag, pos);
      if (closePos >= 0) {
        content = xml.substring(pos, closePos);
        pos = closePos + closeTag.length;
      } else {
        content = xml.substring(pos);
        pos = xml.length;
      }
    }

    switch (tagName) {
      case 'boolean':
        final t = content.trim().toLowerCase();
        return LLSD.boolVal(t == 'true' || t == '1' || t == 't');
      case 'integer':
        return LLSD.intVal(int.tryParse(content.trim()) ?? 0);
      case 'real':
        final t = content.trim().toLowerCase();
        if (t == 'nan') return LLSD.realVal(double.nan);
        if (t == 'inf' || t == '+inf') return LLSD.realVal(double.infinity);
        if (t == '-inf') return LLSD.realVal(double.negativeInfinity);
        return LLSD.realVal(double.tryParse(t) ?? 0.0);
      case 'string':
        return LLSD.stringVal(LLSDSerialize._xmlUnescape(content));
      case 'uuid':
        final t = content.trim();
        if (t.isEmpty) return LLSD.uuidVal(LLUUID.nullUuid);
        return LLSD.uuidVal(LLUUID.fromString(t));
      case 'date':
        final t = content.trim();
        if (t.isEmpty) return LLSD.dateVal(LLDate.nullDate);
        return LLSD.dateVal(LLDate.fromISOString(t));
      case 'uri':
        return LLSD.uriVal(LLURI(LLSDSerialize._xmlUnescape(content.trim())));
      case 'binary':
        final t = content.trim();
        if (t.isEmpty) return LLSD.binaryVal(Uint8List(0));
        try {
          return LLSD.binaryVal(base64Decode(t));
        } catch (_) {
          return LLSD.binaryVal(Uint8List(0));
        }
      case 'map':
        final map = <String, LLSD>{};
        final innerState = _XmlState(content);
        while (innerState.pos < content.length) {
          innerState.skipMisc();
          if (innerState.pos >= content.length) break;
          final kStart = content.indexOf('<key>', innerState.pos);
          if (kStart >= 0) {
            innerState.pos = kStart + 5;
            final kEnd = content.indexOf('</key>', innerState.pos);
            if (kEnd >= 0) {
              final rawKey = content.substring(innerState.pos, kEnd);
              final key = LLSDSerialize._xmlUnescape(rawKey);
              innerState.pos = kEnd + 6;
              final val = innerState.parseNode();
              map[key] = val;
            } else {
              break;
            }
          } else {
            break;
          }
        }
        return LLSD.mapVal(map);
      case 'array':
        final list = <LLSD>[];
        final innerState = _XmlState(content);
        while (innerState.pos < content.length) {
          innerState.skipMisc();
          if (innerState.pos >= content.length) break;
          if (content[innerState.pos] == '<') {
            list.add(innerState.parseNode());
          } else {
            innerState.pos++;
          }
        }
        return LLSD.arrayVal(list);
      default:
        return LLSD.undefined;
    }
  }
}

class _BinaryState {
  final Uint8List bytes;
  int pos;
  late ByteData bd;

  _BinaryState(this.bytes, this.pos) {
    bd = ByteData.view(bytes.buffer, bytes.offsetInBytes, bytes.length);
  }

  LLSD readBinary() {
    if (pos >= bytes.length) return LLSD.undefined;
    final tag = bytes[pos++];

    switch (tag) {
      case 33: // '!'
        return LLSD.undefined;
      case 49: // '1'
        return LLSD.boolVal(true);
      case 48: // '0'
        return LLSD.boolVal(false);
      case 105: // 'i'
        if (pos + 4 > bytes.length) return LLSD.undefined;
        final v = bd.getInt32(pos, Endian.big);
        pos += 4;
        return LLSD.intVal(v);
      case 114: // 'r'
        if (pos + 8 > bytes.length) return LLSD.undefined;
        final v = bd.getFloat64(pos, Endian.big);
        pos += 8;
        return LLSD.realVal(v);
      case 115: // 's'
        if (pos + 4 > bytes.length) return LLSD.undefined;
        final len = bd.getInt32(pos, Endian.big);
        pos += 4;
        if (len < 0 || pos + len > bytes.length) return LLSD.undefined;
        final strBytes = bytes.sublist(pos, pos + len);
        pos += len;
        return LLSD.stringVal(utf8.decode(strBytes, allowMalformed: true));
      case 83: // 'S' (Short string)
        if (pos + 1 > bytes.length) return LLSD.undefined;
        final len = bytes[pos++];
        if (pos + len > bytes.length) return LLSD.undefined;
        final strBytes = bytes.sublist(pos, pos + len);
        pos += len;
        return LLSD.stringVal(utf8.decode(strBytes, allowMalformed: true));
      case 117: // 'u'
        if (pos + 16 > bytes.length) return LLSD.undefined;
        final uBytes = bytes.sublist(pos, pos + 16);
        pos += 16;
        return LLSD.uuidVal(LLUUID(uBytes));
      case 100: // 'd'
        if (pos + 8 > bytes.length) return LLSD.undefined;
        final v = bd.getFloat64(pos, Endian.little);
        pos += 8;
        return LLSD.dateVal(LLDate(v));
      case 108: // 'l'
        if (pos + 4 > bytes.length) return LLSD.undefined;
        final len = bd.getInt32(pos, Endian.big);
        pos += 4;
        if (len < 0 || pos + len > bytes.length) return LLSD.undefined;
        final uriBytes = bytes.sublist(pos, pos + len);
        pos += len;
        return LLSD.uriVal(LLURI(utf8.decode(uriBytes, allowMalformed: true)));
      case 98: // 'b'
        if (pos + 4 > bytes.length) return LLSD.undefined;
        final len = bd.getInt32(pos, Endian.big);
        pos += 4;
        if (len < 0 || pos + len > bytes.length) return LLSD.undefined;
        final binBytes = bytes.sublist(pos, pos + len);
        pos += len;
        return LLSD.binaryVal(Uint8List.fromList(binBytes));
      case 123: // '{'
        if (pos + 4 > bytes.length) return LLSD.undefined;
        final count = bd.getInt32(pos, Endian.big);
        pos += 4;
        final map = <String, LLSD>{};
        for (var i = 0; i < count; i++) {
          if (pos >= bytes.length) break;
          final keyTag = bytes[pos++];
          String key = '';
          if (keyTag == 107 || keyTag == 115) { // 'k' or 's'
            if (pos + 4 > bytes.length) break;
            final klen = bd.getInt32(pos, Endian.big);
            pos += 4;
            if (klen < 0 || pos + klen > bytes.length) break;
            key = utf8.decode(bytes.sublist(pos, pos + klen), allowMalformed: true);
            pos += klen;
          } else if (keyTag == 83) { // 'S'
            if (pos + 1 > bytes.length) break;
            final klen = bytes[pos++];
            if (pos + klen > bytes.length) break;
            key = utf8.decode(bytes.sublist(pos, pos + klen), allowMalformed: true);
            pos += klen;
          } else {
            break;
          }
          final val = readBinary();
          map[key] = val;
        }
        if (pos < bytes.length && bytes[pos] == 125) pos++; // '}'
        return LLSD.mapVal(map);
      case 91: // '['
        if (pos + 4 > bytes.length) return LLSD.undefined;
        final count = bd.getInt32(pos, Endian.big);
        pos += 4;
        final list = <LLSD>[];
        for (var i = 0; i < count; i++) {
          list.add(readBinary());
        }
        if (pos < bytes.length && bytes[pos] == 93) pos++; // ']'
        return LLSD.arrayVal(list);
      default:
        return LLSD.undefined;
    }
  }
}

class _NotationState {
  final String text;
  int pos = 0;

  _NotationState(this.text);

  void skipWs() {
    while (pos < text.length) {
      final c = text[pos];
      if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
        pos++;
      } else {
        break;
      }
    }
  }

  LLSD parseValue() {
    skipWs();
    if (pos >= text.length) return LLSD.undefined;

    final c = text[pos];
    switch (c) {
      case '!':
        pos++;
        return LLSD.undefined;
      case '1':
        pos++;
        return LLSD.boolVal(true);
      case '0':
        pos++;
        return LLSD.boolVal(false);
      case 't':
      case 'T':
        return parseBoolWord(true);
      case 'f':
      case 'F':
        return parseBoolWord(false);
      case 'i':
        pos++;
        final word = parseNumberWord();
        return LLSD.intVal(int.tryParse(word) ?? 0);
      case 'r':
        pos++;
        final word = parseNumberWord().toLowerCase();
        if (word == 'nan') return LLSD.realVal(double.nan);
        if (word == 'inf' || word == '+inf') return LLSD.realVal(double.infinity);
        if (word == '-inf') return LLSD.realVal(double.negativeInfinity);
        return LLSD.realVal(double.tryParse(word) ?? 0.0);
      case "'":
      case '"':
        return LLSD.stringVal(parseQuoted());
      case 's':
        pos++;
        if (pos < text.length && text[pos] == '(') {
          pos++;
          final numStart = pos;
          while (pos < text.length && text[pos] != ')') pos++;
          final size = int.tryParse(text.substring(numStart, pos)) ?? 0;
          if (pos < text.length) pos++; // ')'
          if (pos < text.length && (text[pos] == '"' || text[pos] == "'")) pos++;
          final end = (pos + size).clamp(0, text.length);
          final str = text.substring(pos, end);
          pos = end;
          if (pos < text.length && (text[pos] == '"' || text[pos] == "'")) pos++;
          return LLSD.stringVal(str);
        }
        if (pos < text.length && (text[pos] == '"' || text[pos] == "'")) {
          return LLSD.stringVal(parseQuoted());
        }
        return LLSD.stringVal('');
      case 'u':
        pos++;
        final end = (pos + 36).clamp(0, text.length);
        final uStr = text.substring(pos, end);
        pos = end;
        return LLSD.uuidVal(LLUUID.fromString(uStr));
      case 'd':
        pos++;
        final iso = parseQuotedAfterTag();
        return LLSD.dateVal(LLDate.fromISOString(iso));
      case 'l':
        pos++;
        final uri = parseQuotedAfterTag();
        return LLSD.uriVal(LLURI(uri));
      case 'b':
        return parseBinaryNotation();
      case '{':
        return parseMap();
      case '[':
        return parseArray();
      default:
        pos++;
        return LLSD.undefined;
    }
  }

  LLSD parseBoolWord(bool value) {
    final word = value ? 'true' : 'false';
    if (pos + word.length <= text.length && text.substring(pos, pos + word.length).toLowerCase() == word) {
      pos += word.length;
    } else {
      pos++;
    }
    return LLSD.boolVal(value);
  }

  String parseNumberWord() {
    final start = pos;
    while (pos < text.length) {
      final c = text[pos];
      if (c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == ',' || c == '}' || c == ']' || c == ':') break;
      pos++;
    }
    return text.substring(start, pos);
  }

  String parseQuotedAfterTag() {
    skipWs();
    if (pos < text.length && (text[pos] == '"' || text[pos] == "'")) {
      return parseQuoted();
    }
    return '';
  }

  String parseQuoted() {
    if (pos >= text.length) return '';
    final quoteChar = text[pos++];
    final sb = StringBuffer();
    while (pos < text.length && text[pos] != quoteChar) {
      if (text[pos] == '\\' && pos + 1 < text.length) {
        pos++;
        final esc = text[pos];
        switch (esc) {
          case 'n': sb.write('\n'); break;
          case 'r': sb.write('\r'); break;
          case 't': sb.write('\t'); break;
          default: sb.write(esc); break;
        }
      } else {
        sb.write(text[pos]);
      }
      pos++;
    }
    if (pos < text.length) pos++;
    return sb.toString();
  }

  LLSD parseBinaryNotation() {
    pos++; // 'b'
    if (pos + 2 <= text.length && text.substring(pos, pos + 2) == '64') {
      pos += 2;
      final b64 = parseQuotedAfterTag();
      try {
        return LLSD.binaryVal(base64Decode(b64));
      } catch (_) {
        return LLSD.binaryVal(Uint8List(0));
      }
    } else if (pos + 2 <= text.length && text.substring(pos, pos + 2) == '16') {
      pos += 2;
      final hex = parseQuotedAfterTag();
      final bytes = <int>[];
      for (var i = 0; i < hex.length; i += 2) {
        if (i + 2 <= hex.length) {
          final b = int.tryParse(hex.substring(i, i + 2), radix: 16);
          if (b != null) bytes.add(b);
        }
      }
      return LLSD.binaryVal(Uint8List.fromList(bytes));
    }
    return LLSD.binaryVal(Uint8List(0));
  }

  LLSD parseMap() {
    pos++; // '{'
    final map = <String, LLSD>{};
    skipWs();
    while (pos < text.length && text[pos] != '}') {
      skipWs();
      if (pos >= text.length || text[pos] == '}') break;
      final String key;
      if (text[pos] == "'" || text[pos] == '"') {
        key = parseQuoted();
      } else {
        key = parseNumberWord();
      }
      skipWs();
      if (pos < text.length && text[pos] == ':') pos++;
      skipWs();
      final val = parseValue();
      map[key] = val;
      skipWs();
      if (pos < text.length && text[pos] == ',') pos++;
      skipWs();
    }
    if (pos < text.length) pos++; // '}'
    return LLSD.mapVal(map);
  }

  LLSD parseArray() {
    pos++; // '['
    final list = <LLSD>[];
    skipWs();
    while (pos < text.length && text[pos] != ']') {
      list.add(parseValue());
      skipWs();
      if (pos < text.length && text[pos] == ',') pos++;
      skipWs();
    }
    if (pos < text.length) pos++; // ']'
    return LLSD.arrayVal(list);
  }
}
