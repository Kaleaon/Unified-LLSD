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
      case LLSDType.Undefined:
        return '!';
      case LLSDType.Boolean:
        return sd.asBoolean() ? 'true' : 'false';
      case LLSDType.Integer:
        return `i${sd.asBigInt()}`;
      case LLSDType.Real:
        const r = sd.asReal();
        if (isNaN(r)) return 'rnan';
        if (!isFinite(r)) return r > 0 ? 'rinf' : 'r-inf';
        return `r${r}`;
      case LLSDType.String:
        return `'${this.escapeNotationString(sd.asString())}'`;
      case LLSDType.UUID:
        return `u${sd.asUUID().toString()}`;
      case LLSDType.Date:
        return `d"${sd.asDate().toISOString()}"`;
      case LLSDType.URI:
        return `l"${sd.asURI().asString()}"`;
      case LLSDType.Binary:
        return `b64"${Buffer.from(sd.asBinary()).toString('base64')}"`;
      case LLSDType.Map:
        const map = sd.asMap();
        const mapParts: string[] = [];
        for (const [k, v] of map.entries()) {
          mapParts.push(`'${this.escapeNotationString(k)}':${this.toNotation(v)}`);
        }
        return `{${mapParts.join(',')}}`;
      case LLSDType.Array:
        const arr = sd.asArray();
        const arrParts = arr.map(v => this.toNotation(v));
        return `[${arrParts.join(',')}]`;
    }
  }

  private static escapeNotationString(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  public static fromNotation(text: string): LLSD {
    let clean = text;
    if (clean.startsWith('<?llsd/notation?>') || clean.startsWith('<? llsd/notation ?>')) {
      const nl = clean.indexOf('\n');
      if (nl >= 0) {
        clean = clean.substring(nl + 1);
      }
    }
    return new TypeScriptNotationParser(clean).parse();
  }
}

class TypeScriptNotationParser {
  private pos = 0;

  constructor(private text: string) {}

  public parse(): LLSD {
    this.skipWs();
    return this.parseValue();
  }

  private skipWs(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) {
      this.pos++;
    }
  }

  private peek(): string {
    return this.pos < this.text.length ? this.text[this.pos] : '';
  }

  private peekAt(offset: number): string {
    return this.pos + offset < this.text.length ? this.text[this.pos + offset] : '';
  }

  private consume(): string {
    return this.pos < this.text.length ? this.text[this.pos++] : '';
  }

  public parseValue(): LLSD {
    this.skipWs();
    if (this.pos >= this.text.length) return LLSD.undefined;
    const c = this.peek();

    if (c === '!') { this.consume(); return LLSD.undefined; }
    if (c === 'T' || c === 't') return this.parseBoolWord(true);
    if (c === 'F' || c === 'f') return this.parseBoolWord(false);
    if (c === '1') { this.consume(); return new LLSD(true); }
    if (c === '0') { this.consume(); return new LLSD(false); }
    if (c === 'i') {
      this.consume();
      const numStr = this.parseNumberWord();
      try { return new LLSD(BigInt(numStr)); } catch { return new LLSD(0n); }
    }
    if (c === 'r') {
      this.consume();
      const numStr = this.parseNumberWord();
      if (numStr === 'nan') return new LLSD(NaN, LLSDType.Real);
      if (numStr === 'inf' || numStr === '+inf' || numStr === 'infinity') return new LLSD(Infinity, LLSDType.Real);
      if (numStr === '-inf' || numStr === '-infinity') return new LLSD(-Infinity, LLSDType.Real);
      return new LLSD(parseFloat(numStr), LLSDType.Real);
    }
    if (c === 'u') {
      this.consume();
      const uuidStr = this.parseUuidLiteral();
      return new LLSD(new LLUUID(uuidStr));
    }
    if (c === 'd') {
      this.consume();
      const qStr = this.parseQuotedAfterTag();
      return new LLSD(new LLDate(qStr));
    }
    if (c === 'l') {
      this.consume();
      const qStr = this.parseQuotedAfterTag();
      return new LLSD(new LLURI(qStr));
    }
    if (c === 'b') return this.parseBinaryNotation();
    if (c === 's') return this.parseSizedString();
    if (c === "'") return new LLSD(this.parseSingleQuoted());
    if (c === '"') return new LLSD(this.parseDoubleQuoted());
    if (c === '{') return this.parseMap();
    if (c === '[') return this.parseArray();

    this.consume();
    return LLSD.undefined;
  }

  private parseBoolWord(expectedBool: boolean): LLSD {
    const word = expectedBool ? 'true' : 'false';
    let matched = true;
    for (let i = 0; i < word.length; i++) {
      if (this.peekAt(i).toLowerCase() !== word[i].toLowerCase()) {
        matched = false;
        break;
      }
    }
    if (matched) {
      this.pos += word.length;
    } else {
      this.consume();
    }
    return new LLSD(expectedBool);
  }

  private parseNumberWord(): string {
    const start = this.pos;
    while (this.pos < this.text.length) {
      const c = this.text[this.pos];
      if (/\s/.test(c) || c === ',' || c === '}' || c === ']') {
        break;
      }
      this.pos++;
    }
    return this.text.substring(start, this.pos);
  }

  private parseUuidLiteral(): string {
    const start = this.pos;
    const end = Math.min(start + 36, this.text.length);
    this.pos = end;
    return this.text.substring(start, end);
  }

  private parseQuotedAfterTag(): string {
    this.skipWs();
    const c = this.peek();
    if (c === '"') return this.parseDoubleQuoted();
    if (c === "'") return this.parseSingleQuoted();
    return '';
  }

  private parseDoubleQuoted(): string {
    if (this.peek() !== '"') return '';
    this.consume();
    let sb = '';
    while (this.pos < this.text.length && this.peek() !== '"') {
      if (this.peek() === '\\' && this.pos + 1 < this.text.length) {
        this.consume();
        sb += this.decodeEscape(this.consume());
      } else {
        sb += this.consume();
      }
    }
    if (this.pos < this.text.length) this.consume();
    return sb;
  }

  private parseSingleQuoted(): string {
    if (this.peek() !== "'") return '';
    this.consume();
    let sb = '';
    while (this.pos < this.text.length && this.peek() !== "'") {
      if (this.peek() === '\\' && this.pos + 1 < this.text.length) {
        this.consume();
        sb += this.decodeEscape(this.consume());
      } else {
        sb += this.consume();
      }
    }
    if (this.pos < this.text.length) this.consume();
    return sb;
  }

  private decodeEscape(c: string): string {
    switch (c) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      default: return c;
    }
  }

  private parseSizedString(): LLSD {
    this.consume(); // 's'
    if (this.peek() === '(') {
      this.consume(); // '('
      const start = this.pos;
      while (this.pos < this.text.length && this.peek() !== ')') this.pos++;
      const size = parseInt(this.text.substring(start, this.pos), 10) || 0;
      if (this.pos < this.text.length) this.consume(); // ')'
      if (this.pos < this.text.length && (this.peek() === '"' || this.peek() === "'")) {
        this.consume();
      }
      const end = Math.min(this.pos + size, this.text.length);
      const str = this.text.substring(this.pos, end);
      this.pos = end;
      if (this.pos < this.text.length && (this.peek() === '"' || this.peek() === "'")) {
        this.consume();
      }
      return new LLSD(str);
    }
    if (this.peek() === '"') return new LLSD(this.parseDoubleQuoted());
    if (this.peek() === "'") return new LLSD(this.parseSingleQuoted());
    return new LLSD('');
  }

  private parseBinaryNotation(): LLSD {
    this.consume(); // 'b'
    const p0 = this.peekAt(0);
    const p1 = this.peekAt(1);

    if (p0 === '6' && p1 === '4') {
      this.pos += 2;
      const dataStr = this.parseQuotedAfterTag();
      try {
        return new LLSD(new Uint8Array(Buffer.from(dataStr, 'base64')));
      } catch {
        return new LLSD(new Uint8Array(0));
      }
    }
    if (p0 === '1' && p1 === '6') {
      this.pos += 2;
      const hexStr = this.parseQuotedAfterTag();
      return new LLSD(this.hexDecode(hexStr));
    }
    if (p0 === '(') {
      this.consume(); // '('
      const start = this.pos;
      while (this.pos < this.text.length && this.peek() !== ')') this.pos++;
      const size = parseInt(this.text.substring(start, this.pos), 10) || 0;
      if (this.pos < this.text.length) this.consume(); // ')'
      if (this.pos < this.text.length && (this.peek() === '"' || this.peek() === "'")) {
        this.consume();
      }
      const end = Math.min(this.pos + size, this.text.length);
      const bytes = new Uint8Array(end - this.pos);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = this.text.charCodeAt(this.pos + i);
      }
      this.pos = end;
      if (this.pos < this.text.length && (this.peek() === '"' || this.peek() === "'")) {
        this.consume();
      }
      return new LLSD(bytes);
    }
    return new LLSD(new Uint8Array(0));
  }

  private hexDecode(hex: string): Uint8Array {
    const clean = hex.replace(/\s+/g, '');
    const bytes = new Uint8Array(Math.floor(clean.length / 2));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  private parseMap(): LLSD {
    this.consume(); // '{'
    const map = new Map<string, LLSD>();
    this.skipWs();
    while (this.pos < this.text.length && this.peek() !== '}') {
      this.skipWs();
      if (this.peek() === '}') break;
      const ch = this.peek();
      let key = '';
      if (ch === "'") {
        key = this.parseSingleQuoted();
      } else if (ch === '"') {
        key = this.parseDoubleQuoted();
      } else if (ch === 's') {
        key = this.parseSizedString().asString();
      } else {
        key = this.parseNumberWord();
      }
      this.skipWs();
      if (this.peek() === ':') this.consume();
      this.skipWs();
      const val = this.parseValue();
      map.set(key, val);
      this.skipWs();
      if (this.peek() === ',') this.consume();
      this.skipWs();
    }
    if (this.pos < this.text.length && this.peek() === '}') this.consume();
    return new LLSD(map);
  }

  private parseArray(): LLSD {
    this.consume(); // '['
    const list: LLSD[] = [];
    this.skipWs();
    while (this.pos < this.text.length && this.peek() !== ']') {
      this.skipWs();
      if (this.peek() === ']') break;
      const val = this.parseValue();
      list.push(val);
      this.skipWs();
      if (this.peek() === ',') this.consume();
      this.skipWs();
    }
    if (this.pos < this.text.length && this.peek() === ']') this.consume();
    return new LLSD(list);
  }
}
