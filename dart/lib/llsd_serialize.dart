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
