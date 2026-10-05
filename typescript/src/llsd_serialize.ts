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
  public static toBinary(sd: LLSD): Uint8Array {
    const chunks: Uint8Array[] = [];
    this.writeBinary(chunks, sd);
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
      default: chunks.push(new Uint8Array([33])); break;
    }
  }

  public static fromBinary(bytes: Uint8Array): LLSD {
    if (bytes.length === 0) return LLSD.undefined;
    const tag = bytes[0];
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (tag === 33) return LLSD.undefined;
    if (tag === 49) return new LLSD(true);
    if (tag === 48) return new LLSD(false);
    if (tag === 105) return new LLSD(BigInt(dv.getInt32(1, false)));
    if (tag === 114) return new LLSD(dv.getFloat64(1, false));
    if (tag === 100) return new LLSD(new LLDate(dv.getFloat64(1, true))); // Date is LE!
    return LLSD.undefined;
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
