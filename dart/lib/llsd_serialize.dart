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
          sb.write('<string>${xmlEscape(s)}</string>');
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
        final d = sd.asDate();
        if (d.isNull) {
          sb.write('<date/>');
        } else {
          sb.write('<date>${d.toISOString()}</date>');
        }
        break;
      case LLSDType.uri:
        final u = sd.asURI().asString();
        if (u.isEmpty) {
          sb.write('<uri/>');
        } else {
          sb.write('<uri>${xmlEscape(u)}</uri>');
        }
        break;
      case LLSDType.binary:
        final b = sd.asBinary();
        if (b.isEmpty) {
          sb.write('<binary/>');
        } else {
          sb.write('<binary encoding="base64">${base64Encode(b)}</binary>');
        }
        break;
      case LLSDType.map:
        final map = sd.asMap();
        if (map.isEmpty) {
          sb.write('<map/>');
        } else {
          sb.write('<map>');
          map.forEach((k, v) {
            sb.write('<key>${xmlEscape(k)}</key>');
            _writeXmlElement(sb, v);
          });
          sb.write('</map>');
        }
        break;
      case LLSDType.array:
        final list = sd.asArray();
        if (list.isEmpty) {
          sb.write('<array/>');
        } else {
          sb.write('<array>');
          for (final item in list) {
            _writeXmlElement(sb, item);
          }
          sb.write('</array>');
        }
        break;
    }
  }

  static String xmlEscape(String s) {
    return s
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
  }

  static String xmlUnescape(String s) {
    var res = s
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'")
        .replaceAll('&#39;', "'")
        .replaceAll('&amp;', '&');
    if (res.contains('&#')) {
      res = _decodeNumericEntities(res);
    }
    return res;
  }

  static String _decodeNumericEntities(String s) {
    return s.replaceAllMapped(RegExp(r'&#(x[0-9a-fA-F]+|\d+);'), (match) {
      final codeStr = match.group(1)!;
      int? codePoint;
      if (codeStr.startsWith('x') || codeStr.startsWith('X')) {
        codePoint = int.tryParse(codeStr.substring(1), radix: 16);
      } else {
        codePoint = int.tryParse(codeStr, radix: 10);
      }
      if (codePoint != null && codePoint >= 0 && codePoint <= 0x10FFFF) {
        return String.fromCharCode(codePoint);
      }
      return match.group(0)!;
    });
  }

  static LLSD fromXML(String xml) {
    final parser = _LLSDXMLParser(xml);
    return parser.parse();
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
      case LLSDType.undefined: return '!';
      case LLSDType.boolean: return sd.asBoolean() ? 'true' : 'false';
      case LLSDType.integer: return 'i${sd.asInt()}';
      case LLSDType.real: return 'r${sd.asReal()}';
      case LLSDType.string: return "'${sd.asString()}'";
      case LLSDType.uuid: return 'u${sd.asUUID()}';
      case LLSDType.date: return 'd"${sd.asDate().toISOString()}"';
      case LLSDType.uri: return 'l"${sd.asURI().asString()}"';
      case LLSDType.binary: return 'b64"${base64Encode(sd.asBinary())}"';
      default: return '!';
    }
  }

  static LLSD fromNotation(String text) {
    final clean = text.trim();
    if (clean == '!') return LLSD.undefined;
    if (clean.startsWith('i')) return LLSD.intVal(int.parse(clean.substring(1)));
    if (clean.startsWith('r')) return LLSD.realVal(double.parse(clean.substring(1)));
    if (clean.startsWith("'") && clean.endsWith("'")) return LLSD.stringVal(clean.substring(1, clean.length - 1));
    return LLSD.undefined;
  }
}

class _TagToken {
  final String name;
  final Map<String, String> attributes;
  final bool isEnd;
  final bool isSelfClosing;

  _TagToken(this.name, this.attributes, this.isEnd, this.isSelfClosing);
}

class _LLSDXMLParser {
  final String input;
  int pos = 0;
  static const int maxDepth = 256;

  _LLSDXMLParser(this.input);

  LLSD parse() {
    while (pos < input.length) {
      _skipWhitespaceAndComments();
      if (pos >= input.length) break;
      if (input[pos] == '<') {
        final tag = _readTagToken();
        if (tag != null) {
          if (tag.isEnd) continue;
          if (tag.name.toLowerCase() == 'llsd') {
            if (tag.isSelfClosing) return LLSD.undefined;
            return _parseValue(0);
          } else {
            return _parseElement(tag, 0);
          }
        }
      } else {
        pos++;
      }
    }
    return LLSD.undefined;
  }

  LLSD _parseValue(int depth) {
    if (depth > maxDepth) return LLSD.undefined;
    while (pos < input.length) {
      _skipWhitespaceAndComments();
      if (pos >= input.length) break;
      if (input[pos] == '<') {
        final saved = pos;
        final tag = _readTagToken();
        if (tag != null) {
          if (tag.isEnd) {
            if (tag.name.toLowerCase() == 'llsd') return LLSD.undefined;
            return LLSD.undefined;
          }
          return _parseElement(tag, depth);
        } else {
          pos = saved;
          break;
        }
      } else {
        pos++;
      }
    }
    return LLSD.undefined;
  }

  LLSD _parseElement(_TagToken tag, int depth) {
    if (depth > maxDepth) return LLSD.undefined;
    final name = tag.name.toLowerCase();

    if (tag.isSelfClosing) {
      switch (name) {
        case 'undef': return LLSD.undefined;
        case 'boolean': return LLSD.boolVal(false);
        case 'integer': return LLSD.intVal(0);
        case 'real': return LLSD.realVal(0.0);
        case 'string': return LLSD.stringVal('');
        case 'uuid': return LLSD.uuidVal(LLUUID.nullUuid);
        case 'date': return LLSD.dateVal(LLDate.nullDate);
        case 'uri': return LLSD.uriVal(LLURI(''));
        case 'binary': return LLSD.binaryVal(Uint8List(0));
        case 'map': return LLSD.mapVal({});
        case 'array': return LLSD.arrayVal([]);
        default: return LLSD.undefined;
      }
    }

    switch (name) {
      case 'undef':
        _readContentUntilEndTag(name);
        return LLSD.undefined;
      case 'boolean':
        final raw = _readContentUntilEndTag(name).trim().toLowerCase();
        return LLSD.boolVal(raw == 'true' || raw == '1');
      case 'integer':
        final raw = _readContentUntilEndTag(name).trim();
        return LLSD.intVal(int.tryParse(raw) ?? 0);
      case 'real':
        final raw = _readContentUntilEndTag(name).trim().toLowerCase();
        if (raw == 'nan') return LLSD.realVal(double.nan);
        if (raw == 'inf' || raw == '+inf') return LLSD.realVal(double.infinity);
        if (raw == '-inf') return LLSD.realVal(-double.infinity);
        return LLSD.realVal(double.tryParse(raw) ?? 0.0);
      case 'string':
        final raw = _readContentUntilEndTag(name);
        return LLSD.stringVal(LLSDSerialize.xmlUnescape(raw));
      case 'uuid':
        final raw = _readContentUntilEndTag(name).trim();
        return LLSD.uuidVal(LLUUID.fromString(raw));
      case 'date':
        final raw = _readContentUntilEndTag(name).trim();
        return LLSD.dateVal(LLDate.fromISOString(raw));
      case 'uri':
        final raw = _readContentUntilEndTag(name).trim();
        return LLSD.uriVal(LLURI(LLSDSerialize.xmlUnescape(raw)));
      case 'binary':
        final raw = _readContentUntilEndTag(name)
            .replaceAll('\n', '')
            .replaceAll('\r', '')
            .replaceAll(' ', '')
            .replaceAll('\t', '');
        try {
          return LLSD.binaryVal(base64Decode(raw));
        } catch (_) {
          return LLSD.binaryVal(Uint8List(0));
        }
      case 'map':
        final map = <String, LLSD>{};
        while (pos < input.length) {
          _skipWhitespaceAndComments();
          if (pos >= input.length) break;
          if (input[pos] == '<') {
            final childTag = _readTagToken();
            if (childTag != null) {
              if (childTag.isEnd) {
                if (childTag.name.toLowerCase() == 'map') {
                  return LLSD.mapVal(map);
                }
                continue;
              }
              if (childTag.name.toLowerCase() == 'key') {
                final String keyName;
                if (childTag.isSelfClosing) {
                  keyName = '';
                } else {
                  final rawKey = _readContentUntilEndTag('key');
                  keyName = LLSDSerialize.xmlUnescape(rawKey);
                }
                final val = _parseValue(depth + 1);
                map[keyName] = val;
              }
            }
          } else {
            pos++;
          }
        }
        return LLSD.mapVal(map);
      case 'array':
        final array = <LLSD>[];
        while (pos < input.length) {
          _skipWhitespaceAndComments();
          if (pos >= input.length) break;
          if (input[pos] == '<') {
            final childTag = _readTagToken();
            if (childTag != null) {
              if (childTag.isEnd) {
                if (childTag.name.toLowerCase() == 'array') {
                  return LLSD.arrayVal(array);
                }
                continue;
              }
              final childVal = _parseElement(childTag, depth + 1);
              array.add(childVal);
            }
          } else {
            pos++;
          }
        }
        return LLSD.arrayVal(array);
      default:
        return LLSD.undefined;
    }
  }

  void _skipWhitespaceAndComments() {
    while (pos < input.length) {
      final ch = input[pos];
      if (ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n') {
        pos++;
        continue;
      }
      if (ch == '<') {
        final rest = input.substring(pos);
        if (rest.startsWith('<!--')) {
          final endIdx = input.indexOf('-->', pos);
          if (endIdx != -1) {
            pos = endIdx + 3;
            continue;
          } else {
            pos = input.length;
            break;
          }
        }
        if (rest.startsWith('<?')) {
          final endIdx = input.indexOf('?>', pos);
          if (endIdx != -1) {
            pos = endIdx + 2;
            continue;
          } else {
            pos = input.length;
            break;
          }
        }
      }
      break;
    }
  }

  _TagToken? _readTagToken() {
    if (pos >= input.length || input[pos] != '<') return null;
    final closeIdx = input.indexOf('>', pos);
    if (closeIdx == -1) return null;
    final tagContent = input.substring(pos + 1, closeIdx).trim();
    pos = closeIdx + 1;

    if (tagContent.startsWith('/')) {
      final name = tagContent.substring(1).trim();
      return _TagToken(name, {}, true, false);
    }

    var isSelfClosing = false;
    var content = tagContent;
    if (content.endsWith('/')) {
      isSelfClosing = true;
      content = content.substring(0, content.length - 1).trim();
    }

    final spaceIdx = content.indexOf(RegExp(r'\s'));
    final tagName = spaceIdx == -1 ? content : content.substring(0, spaceIdx);

    final attrs = <String, String>{};
    if (spaceIdx != -1) {
      final attrStr = content.substring(spaceIdx).trim();
      final attrMatches = RegExp('(\\w+)=["\']([^"\']*)["\']').allMatches(attrStr);
      for (final m in attrMatches) {
        attrs[m.group(1)!] = m.group(2)!;
      }
    }

    return _TagToken(tagName, attrs, false, isSelfClosing);
  }

  String _readContentUntilEndTag(String tagName) {
    final endTagLower = '</${tagName.toLowerCase()}>';
    final endTagLowerSpace = '</${tagName.toLowerCase()} ';

    final sb = StringBuffer();
    while (pos < input.length) {
      final restLower = input.substring(pos).toLowerCase();
      if (restLower.startsWith(endTagLower) || restLower.startsWith(endTagLowerSpace)) {
        final closeIdx = input.indexOf('>', pos);
        if (closeIdx != -1) {
          pos = closeIdx + 1;
        } else {
          pos = input.length;
        }
        break;
      }

      if (input.substring(pos).startsWith('<![CDATA[')) {
        pos += 9;
        final cdataEnd = input.indexOf(']]>', pos);
        if (cdataEnd != -1) {
          sb.write(input.substring(pos, cdataEnd));
          pos = cdataEnd + 3;
        } else {
          sb.write(input.substring(pos));
          pos = input.length;
        }
        continue;
      }

      if (input.substring(pos).startsWith('<!--')) {
        final commentEnd = input.indexOf('-->', pos);
        if (commentEnd != -1) {
          pos = commentEnd + 3;
        } else {
          pos = input.length;
        }
        continue;
      }

      sb.write(input[pos]);
      pos++;
    }
    return sb.toString();
  }
}
