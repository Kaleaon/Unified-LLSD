import { LLSD, LLSDType } from './llsd.js';
import { LLUUID } from './lluuid.js';
import { LLDate } from './lldate.js';
import { LLURI } from './lluri.js';

export class LLSDSerialize {
  public static readonly binaryHeader = "<? llsd/binary ?>\n";
  public static readonly notationHeader = "<? llsd/notation ?>\n";
  public static readonly xmlHeader = "<?xml version=\"1.0\" ?>\n";

  // --- XML ---
  public static toXML(sd: LLSD, withDeclaration = false): string {
    let xml = withDeclaration ? this.xmlHeader : '';
    xml += '<llsd>';
    xml += this.writeXmlElement(sd);
    xml += '</llsd>';
    return xml;
  }

  private static writeXmlElement(sd: LLSD): string {
    switch (sd.type) {
      case LLSDType.Undefined: return '<undef/>';
      case LLSDType.Boolean: return `<boolean>${sd.asBoolean() ? 'true' : 'false'}</boolean>`;
      case LLSDType.Integer: return `<integer>${sd.asBigInt()}</integer>`;
      case LLSDType.Real:
        const r = sd.asReal();
        if (isNaN(r)) return '<real>nan</real>';
        if (!isFinite(r)) return `<real>${r > 0 ? 'inf' : '-inf'}</real>`;
        return `<real>${r}</real>`;
      case LLSDType.String:
        const s = sd.asString();
        return s ? `<string>${this.xmlEscape(s)}</string>` : '<string/>';
      case LLSDType.UUID:
        const u = sd.asUUID();
        return u.isNull ? '<uuid/>' : `<uuid>${u.toString()}</uuid>`;
      case LLSDType.Date: return `<date>${sd.asDate().toISOString()}</date>`;
      case LLSDType.URI: return `<uri>${this.xmlEscape(sd.asURI().asString())}</uri>`;
      case LLSDType.Binary:
        return `<binary encoding="base64">${Buffer.from(sd.asBinary()).toString('base64')}</binary>`;
      case LLSDType.Map:
        return '<map></map>';
      case LLSDType.Array:
        return '<array></array>';
    }
  }

  private static xmlEscape(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  public static fromXML(xml: string): LLSD {
    if (!xml) return LLSD.undefined;
    const clean = xml.trim();
    const intMatch = clean.match(/<integer>(-?\d+)<\/integer>/);
    if (intMatch) return new LLSD(BigInt(intMatch[1]));
    const strMatch = clean.match(/<string>(.*?)<\/string>/);
    if (strMatch) return new LLSD(strMatch[1]);
    const boolMatch = clean.match(/<boolean>(.*?)<\/boolean>/);
    if (boolMatch) return new LLSD(boolMatch[1] === 'true' || boolMatch[1] === '1');
    return LLSD.undefined;
  }

  // --- Binary ---
  private static readonly textEncoder = new TextEncoder();

  private static getUtf8ByteLength(str: string): number {
    let len = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code < 0x80) {
        len += 1;
      } else if (code < 0x800) {
        len += 2;
      } else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length && str.charCodeAt(i + 1) >= 0xDC00 && str.charCodeAt(i + 1) <= 0xDFFF) {
        len += 4;
        i++;
      } else {
        len += 3;
      }
    }
    return len;
  }

  public static calculateBinarySize(sd: LLSD): number {
    switch (sd.type) {
      case LLSDType.Undefined:
      case LLSDType.Boolean:
        return 1;
      case LLSDType.Integer:
        return 5;
      case LLSDType.Real:
        return 9;
      case LLSDType.UUID:
        return 17;
      case LLSDType.String:
        return 5 + this.getUtf8ByteLength(sd.asString());
      case LLSDType.URI:
        return 5 + this.getUtf8ByteLength(sd.asURI().asString());
      case LLSDType.Binary:
        return 5 + sd.asBinary().length;
      case LLSDType.Date:
        return 9;
      case LLSDType.Map: {
        let size = 5; // '{' + uint32 count
        sd.asMap().forEach((v, k) => {
          size += 5 + this.getUtf8ByteLength(k);
          size += this.calculateBinarySize(v);
        });
        size += 1; // '}'
        return size;
      }
      case LLSDType.Array: {
        let size = 5; // '[' + uint32 count
        const arr = sd.asArray();
        for (let i = 0; i < arr.length; i++) {
          size += this.calculateBinarySize(arr[i]);
        }
        size += 1; // ']'
        return size;
      }
      default:
        return 1;
    }
  }

  public static toBinary(sd: LLSD): Uint8Array {
    const totalLen = this.calculateBinarySize(sd);
    const res = new Uint8Array(totalLen);
    const dv = new DataView(res.buffer, res.byteOffset, res.byteLength);
    this.writeBinaryDirect(sd, res, dv, 0);
    return res;
  }

  private static writeBinaryDirect(sd: LLSD, buffer: Uint8Array, dv: DataView, offset: number): number {
    switch (sd.type) {
      case LLSDType.Undefined:
        buffer[offset++] = 33; // '!'
        return offset;
      case LLSDType.Boolean:
        buffer[offset++] = sd.asBoolean() ? 49 : 48; // '1' or '0'
        return offset;
      case LLSDType.Integer:
        buffer[offset++] = 105; // 'i'
        dv.setInt32(offset, sd.asInteger(), false); // Big endian
        return offset + 4;
      case LLSDType.Real:
        buffer[offset++] = 114; // 'r'
        dv.setFloat64(offset, sd.asReal(), false); // Big endian
        return offset + 8;
      case LLSDType.UUID:
        buffer[offset++] = 117; // 'u'
        buffer.set(sd.asUUID().bytes, offset);
        return offset + 16;
      case LLSDType.String: {
        buffer[offset++] = 115; // 's'
        const s = sd.asString();
        const strLen = this.getUtf8ByteLength(s);
        dv.setUint32(offset, strLen, false);
        offset += 4;
        if (strLen > 0) {
          this.textEncoder.encodeInto(s, buffer.subarray(offset, offset + strLen));
          offset += strLen;
        }
        return offset;
      }
      case LLSDType.URI: {
        buffer[offset++] = 108; // 'l'
        const uriStr = sd.asURI().asString();
        const uriLen = this.getUtf8ByteLength(uriStr);
        dv.setUint32(offset, uriLen, false);
        offset += 4;
        if (uriLen > 0) {
          this.textEncoder.encodeInto(uriStr, buffer.subarray(offset, offset + uriLen));
          offset += uriLen;
        }
        return offset;
      }
      case LLSDType.Binary: {
        buffer[offset++] = 98; // 'b'
        const bin = sd.asBinary();
        dv.setUint32(offset, bin.length, false);
        offset += 4;
        if (bin.length > 0) {
          buffer.set(bin, offset);
          offset += bin.length;
        }
        return offset;
      }
      case LLSDType.Date:
        buffer[offset++] = 100; // 'd'
        dv.setFloat64(offset, sd.asDate().secondsSinceEpoch, true); // Date is LE!
        return offset + 8;
      case LLSDType.Map: {
        buffer[offset++] = 123; // '{'
        const map = sd.asMap();
        dv.setUint32(offset, map.size, false);
        offset += 4;
        map.forEach((v, k) => {
          buffer[offset++] = 107; // 'k'
          const keyLen = this.getUtf8ByteLength(k);
          dv.setUint32(offset, keyLen, false);
          offset += 4;
          if (keyLen > 0) {
            this.textEncoder.encodeInto(k, buffer.subarray(offset, offset + keyLen));
            offset += keyLen;
          }
          offset = this.writeBinaryDirect(v, buffer, dv, offset);
        });
        buffer[offset++] = 125; // '}'
        return offset;
      }
      case LLSDType.Array: {
        buffer[offset++] = 91; // '['
        const arr = sd.asArray();
        dv.setUint32(offset, arr.length, false);
        offset += 4;
        for (let i = 0; i < arr.length; i++) {
          offset = this.writeBinaryDirect(arr[i], buffer, dv, offset);
        }
        buffer[offset++] = 93; // ']'
        return offset;
      }
      default:
        buffer[offset++] = 33;
        return offset;
    }
  }

  public static fromBinary(bytes: Uint8Array): LLSD {
    if (bytes.length === 0) return LLSD.undefined;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;

    function readValue(): LLSD {
      if (offset >= bytes.length) return LLSD.undefined;
      const marker = bytes[offset++];

      switch (marker) {
        case 33: // '!'
          return LLSD.undefined;
        case 48: // '0'
          return new LLSD(false);
        case 49: // '1'
          return new LLSD(true);
        case 105: { // 'i'
          const val = dv.getInt32(offset, false);
          offset += 4;
          return new LLSD(BigInt(val));
        }
        case 114: { // 'r'
          const val = dv.getFloat64(offset, false);
          offset += 8;
          return new LLSD(val);
        }
        case 117: { // 'u'
          const uuid = new LLUUID(bytes.subarray(offset, offset + 16));
          offset += 16;
          return new LLSD(uuid);
        }
        case 115: { // 's'
          const len = dv.getUint32(offset, false);
          offset += 4;
          const str = new TextDecoder('utf-8').decode(bytes.subarray(offset, offset + len));
          offset += len;
          return new LLSD(str);
        }
        case 108: { // 'l'
          const len = dv.getUint32(offset, false);
          offset += 4;
          const uri = new TextDecoder('utf-8').decode(bytes.subarray(offset, offset + len));
          offset += len;
          return new LLSD(new LLURI(uri));
        }
        case 98: { // 'b'
          const len = dv.getUint32(offset, false);
          offset += 4;
          const bin = bytes.slice(offset, offset + len);
          offset += len;
          return new LLSD(bin);
        }
        case 100: { // 'd'
          const sec = dv.getFloat64(offset, true); // LE double
          offset += 8;
          return new LLSD(new LLDate(sec));
        }
        case 123: { // '{'
          const count = dv.getUint32(offset, false);
          offset += 4;
          const map = new Map<string, LLSD>();
          for (let i = 0; i < count; i++) {
            if (bytes[offset] === 107) { // 'k'
              offset++;
              const keyLen = dv.getUint32(offset, false);
              offset += 4;
              const key = new TextDecoder('utf-8').decode(bytes.subarray(offset, offset + keyLen));
              offset += keyLen;
              map.set(key, readValue());
            }
          }
          if (bytes[offset] === 125) offset++; // '}'
          return new LLSD(map);
        }
        case 91: { // '['
          const count = dv.getUint32(offset, false);
          offset += 4;
          const arr: LLSD[] = [];
          for (let i = 0; i < count; i++) {
            arr.push(readValue());
          }
          if (bytes[offset] === 93) offset++; // ']'
          return new LLSD(arr);
        }
        default:
          return LLSD.undefined;
      }
    }

    return readValue();
  }

  // --- Notation ---
  public static toNotation(sd: LLSD): string {
    switch (sd.type) {
      case LLSDType.Undefined: return '!';
      case LLSDType.Boolean: return sd.asBoolean() ? 'true' : 'false';
      case LLSDType.Integer: return `i${sd.asBigInt()}`;
      case LLSDType.Real: return `r${sd.asReal()}`;
      case LLSDType.String: return `'${sd.asString()}'`;
      default: return '!';
    }
  }

  public static fromNotation(text: string): LLSD {
    const clean = text.trim();
    if (clean === '!') return LLSD.undefined;
    if (clean.startsWith('i')) return new LLSD(BigInt(clean.substring(1)));
    if (clean.startsWith('r')) return new LLSD(parseFloat(clean.substring(1)));
    if (clean.startsWith("'") && clean.endsWith("'")) return new LLSD(clean.substring(1, clean.length - 1));
    return LLSD.undefined;
  }
}
