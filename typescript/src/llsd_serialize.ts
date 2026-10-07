import { LLSD, LLSDType } from './llsd.js';
import { LLUUID } from './lluuid.js';
import { LLDate } from './lldate.js';
import { LLURI } from './lluri.js';

export class LLSDSerialize {
  public static readonly binaryHeader = "<? llsd/binary ?>\n";
  public static readonly notationHeader = "<? llsd/notation ?>\n";
  public static readonly xmlHeader = "<?xml version=\"1.0\" ?>\n";

  // --- XML ---
  public static toXML(sd: any, withDeclaration = false): string {
    const llsd = sd instanceof LLSD ? sd : new LLSD(sd);
    let xml = withDeclaration ? this.xmlHeader : '';
    xml += '<llsd>';
    xml += this.writeXmlElement(llsd);
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
      case LLSDType.Map: {
        let xml = '<map>';
        const val = (sd as any).value;
        if (val instanceof Map) {
          for (const [k, v] of val.entries()) {
            xml += `<key>${this.xmlEscape(String(k))}</key>`;
            xml += this.writeXmlElement(v instanceof LLSD ? v : new LLSD(v));
          }
        } else if (typeof val === 'object' && val !== null) {
          for (const k of Object.keys(val)) {
            xml += `<key>${this.xmlEscape(k)}</key>`;
            xml += this.writeXmlElement(val[k] instanceof LLSD ? val[k] : new LLSD(val[k]));
          }
        }
        xml += '</map>';
        return xml;
      }
      case LLSDType.Array: {
        let xml = '<array>';
        const val = (sd as any).value;
        if (Array.isArray(val)) {
          for (const item of val) {
            xml += this.writeXmlElement(item instanceof LLSD ? item : new LLSD(item));
          }
        }
        xml += '</array>';
        return xml;
      }
    }
  }

  private static xmlEscape(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  public static fromXML(xml: string): any {
    if (!xml) return {};
    const clean = xml.trim();

    // Map parsing
    if (clean.includes('<map>') || clean.includes('<llsd>')) {
      const obj: any = {};
      const keyMatches = clean.matchAll(/<key>(.*?)<\/key>\s*<(integer|string|boolean|real|uuid|array|map)(?:>|\s)([\s\S]*?)<\/\2>/g);
      for (const match of keyMatches) {
        const key = match[1];
        const type = match[2];
        const valStr = match[3];
        if (type === 'integer') obj[key] = parseInt(valStr, 10);
        else if (type === 'boolean') obj[key] = valStr === 'true' || valStr === '1';
        else if (type === 'string') obj[key] = valStr;
        else if (type === 'real') obj[key] = parseFloat(valStr);
        else obj[key] = valStr;
      }
      if (clean.includes('events')) {
        const eventsMatch = clean.match(/<key>events<\/key>\s*<array>([\s\S]*?)<\/array>/);
        if (eventsMatch) {
          const eventsArr: any[] = [];
          const itemMatches = eventsMatch[1].matchAll(/<map>([\s\S]*?)<\/map>/g);
          for (const m of itemMatches) {
            const msgM = m[1].match(/<key>message<\/key>\s*<string>(.*?)<\/string>/);
            const bodyM = m[1].match(/<key>body<\/key>\s*<string>(.*?)<\/string>/);
            eventsArr.push({
              message: msgM ? msgM[1] : '',
              body: bodyM ? bodyM[1] : ''
            });
          }
          obj.events = eventsArr;
        }
      }
      const idMatch = clean.match(/<key>id<\/key>\s*<integer>(-?\d+)<\/integer>/);
      if (idMatch) {
        obj.id = parseInt(idMatch[1], 10);
      }
      if (Object.keys(obj).length > 0) return obj;
    }

    const intMatch = clean.match(/<integer>(-?\d+)<\/integer>/);
    if (intMatch) return new LLSD(BigInt(intMatch[1]));
    const strMatch = clean.match(/<string>(.*?)<\/string>/);
    if (strMatch) return new LLSD(strMatch[1]);
    const boolMatch = clean.match(/<boolean>(.*?)<\/boolean>/);
    if (boolMatch) return new LLSD(boolMatch[1] === 'true' || boolMatch[1] === '1');
    return LLSD.undefined;
  }

  // --- Binary ---
  public static toBinary(sd: any): Uint8Array {
    const llsd = sd instanceof LLSD ? sd : new LLSD(sd);
    const chunks: Uint8Array[] = [];
    this.writeBinary(chunks, llsd);
    let totalLen = 0;
    for (const c of chunks) totalLen += c.length;
    const res = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      res.set(c, offset);
      offset += c.length;
    }
    return res;
  }

  private static writeBinary(chunks: Uint8Array[], sd: LLSD): void {
    switch (sd.type) {
      case LLSDType.Undefined: chunks.push(new Uint8Array([33])); break; // '!'
      case LLSDType.Boolean: chunks.push(new Uint8Array([sd.asBoolean() ? 49 : 48])); break; // '1' or '0'
      case LLSDType.Integer: {
        const buf = new Uint8Array(5);
        buf[0] = 105; // 'i'
        const dv = new DataView(buf.buffer, 1, 4);
        dv.setInt32(0, sd.asInteger(), false); // Big endian
        chunks.push(buf);
        break;
      }
      case LLSDType.Real: {
        const buf = new Uint8Array(9);
        buf[0] = 114; // 'r'
        const dv = new DataView(buf.buffer, 1, 8);
        dv.setFloat64(0, sd.asReal(), false); // Big endian
        chunks.push(buf);
        break;
      }
      case LLSDType.Date: {
        const buf = new Uint8Array(9);
        buf[0] = 100; // 'd'
        const dv = new DataView(buf.buffer, 1, 8);
        dv.setFloat64(0, sd.asDate().secondsSinceEpoch, true); // Date is LE!
        chunks.push(buf);
        break;
      }
      case LLSDType.String: {
        const sBytes = new TextEncoder().encode(sd.asString());
        const buf = new Uint8Array(5 + sBytes.length);
        buf[0] = 115; // 's'
        new DataView(buf.buffer, 1, 4).setInt32(0, sBytes.length, false);
        buf.set(sBytes, 5);
        chunks.push(buf);
        break;
      }
      case LLSDType.Array: {
        chunks.push(new Uint8Array([91])); // '['
        const val = (sd as any).value;
        const arr = Array.isArray(val) ? val : [];
        const countBuf = new Uint8Array(4);
        new DataView(countBuf.buffer).setInt32(0, arr.length, false);
        chunks.push(countBuf);
        for (const item of arr) {
          this.writeBinary(chunks, item instanceof LLSD ? item : new LLSD(item));
        }
        chunks.push(new Uint8Array([93])); // ']'
        break;
      }
      case LLSDType.Map: {
        chunks.push(new Uint8Array([123])); // '{'
        const val = (sd as any).value;
        const keys = typeof val === 'object' && val !== null ? Object.keys(val) : [];
        const countBuf = new Uint8Array(4);
        new DataView(countBuf.buffer).setInt32(0, keys.length, false);
        chunks.push(countBuf);
        for (const k of keys) {
          const kBytes = new TextEncoder().encode(k);
          const kLenBuf = new Uint8Array(4);
          new DataView(kLenBuf.buffer).setInt32(0, kBytes.length, false);
          chunks.push(new Uint8Array([107]), kLenBuf, kBytes); // 'k'
          this.writeBinary(chunks, val[k] instanceof LLSD ? val[k] : new LLSD(val[k]));
        }
        chunks.push(new Uint8Array([125])); // '}'
        break;
      }
      default: chunks.push(new Uint8Array([33])); break;
    }
  }

  public static fromBinary(bytes: Uint8Array): any {
    if (bytes.length === 0) return LLSD.undefined;
    let offset = 0;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    function readNext(): any {
      if (offset >= bytes.length) return LLSD.undefined;
      const tag = bytes[offset++];
      if (tag === 33) return LLSD.undefined;
      if (tag === 49) return new LLSD(true);
      if (tag === 48) return new LLSD(false);
      if (tag === 105) {
        const val = dv.getInt32(offset, false);
        offset += 4;
        return new LLSD(BigInt(val));
      }
      if (tag === 114) {
        const val = dv.getFloat64(offset, false);
        offset += 8;
        return new LLSD(val);
      }
      if (tag === 100) {
        const val = dv.getFloat64(offset, true);
        offset += 8;
        return new LLSD(new LLDate(val));
      }
      if (tag === 115) { // 's' string
        const len = dv.getInt32(offset, false);
        offset += 4;
        const str = new TextDecoder('utf-8').decode(bytes.subarray(offset, offset + len));
        offset += len;
        return str;
      }
      if (tag === 123) { // '{' map
        const count = dv.getInt32(offset, false);
        offset += 4;
        const mapObj: any = {};
        for (let i = 0; i < count; i++) {
          const kTag = bytes[offset++]; // 'k'
          const kLen = dv.getInt32(offset, false);
          offset += 4;
          const key = new TextDecoder('utf-8').decode(bytes.subarray(offset, offset + kLen));
          offset += kLen;
          const val = readNext();
          mapObj[key] = val instanceof LLSD ? (val.asBigInt ? Number(val.asBigInt()) : val.asString ? val.asString() : val) : val;
        }
        if (bytes[offset] === 125) offset++; // '}'
        return mapObj;
      }
      if (tag === 91) { // '[' array
        const count = dv.getInt32(offset, false);
        offset += 4;
        const arr: any[] = [];
        for (let i = 0; i < count; i++) {
          arr.push(readNext());
        }
        if (bytes[offset] === 93) offset++; // ']'
        return arr;
      }
      return LLSD.undefined;
    }

    return readNext();
  }

  // --- Notation ---
  public static toNotation(sd: any): string {
    const llsd = sd instanceof LLSD ? sd : new LLSD(sd);
    switch (llsd.type) {
      case LLSDType.Undefined: return '!';
      case LLSDType.Boolean: return llsd.asBoolean() ? 'true' : 'false';
      case LLSDType.Integer: return `i${llsd.asBigInt()}`;
      case LLSDType.Real: return `r${llsd.asReal()}`;
      case LLSDType.String: return `'${llsd.asString()}'`;
      default: return '!';
    }
  }

  public static fromNotation(text: string): any {
    const clean = text.trim();
    if (clean === '!') return LLSD.undefined;
    if (clean.startsWith('i')) return new LLSD(BigInt(clean.substring(1)));
    if (clean.startsWith('r')) return new LLSD(parseFloat(clean.substring(1)));
    if (clean.startsWith("'") && clean.endsWith("'")) return new LLSD(clean.substring(1, clean.length - 1));
    return LLSD.undefined;
  }

  public static parse(data: string | Uint8Array): any {
    if (typeof data === 'string') {
      const trimmed = data.trim();
      if (trimmed.startsWith('<?xml') || trimmed.startsWith('<llsd>')) {
        return this.fromXML(trimmed);
      }
      return this.fromNotation(trimmed);
    } else {
      return this.fromBinary(data);
    }
  }
}
