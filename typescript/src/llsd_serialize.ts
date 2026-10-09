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
      case LLSDType.Real: {
        const r = sd.asReal();
        if (isNaN(r)) return '<real>nan</real>';
        if (!isFinite(r)) return `<real>${r > 0 ? 'inf' : '-inf'}</real>`;
        return `<real>${r}</real>`;
      }
      case LLSDType.String: {
        const s = sd.asString();
        return s ? `<string>${this.xmlEscape(s)}</string>` : '<string/>';
      }
      case LLSDType.UUID: {
        const u = sd.asUUID();
        return u.isNull ? '<uuid/>' : `<uuid>${u.toString()}</uuid>`;
      }
      case LLSDType.Date: return `<date>${sd.asDate().toISOString()}</date>`;
      case LLSDType.URI: return `<uri>${this.xmlEscape(sd.asURI().asString())}</uri>`;
      case LLSDType.Binary:
        return `<binary encoding="base64">${Buffer.from(sd.asBinary()).toString('base64')}</binary>`;
      case LLSDType.Map: {
        let res = '<map>';
        const map = (sd as any).value as Map<string, LLSD>;
        if (map) {
          for (const [k, v] of map.entries()) {
            res += `<key>${this.xmlEscape(k)}</key>`;
            res += this.writeXmlElement(v);
          }
        }
        res += '</map>';
        return res;
      }
      case LLSDType.Array: {
        let res = '<array>';
        const arr = (sd as any).value as LLSD[];
        if (arr) {
          for (const v of arr) {
            res += this.writeXmlElement(v);
          }
        }
        res += '</array>';
        return res;
      }
    }
  }

  private static xmlEscape(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  public static fromXML(xml: string): LLSD {
    if (!xml) return LLSD.undefined;
    let clean = xml.trim();
    if (clean.startsWith('<?xml')) {
      const idx = clean.indexOf('?>');
      if (idx !== -1) clean = clean.substring(idx + 2).trim();
    }
    if (clean.startsWith('<llsd>') && clean.endsWith('</llsd>')) {
      clean = clean.substring(6, clean.length - 7).trim();
    }
    return this.parseXmlValue(clean);
  }

  private static parseXmlValue(xml: string): LLSD {
    xml = xml.trim();
    if (!xml) return LLSD.undefined;

    if (xml.startsWith('<undef/>') || xml.startsWith('<undef />')) return LLSD.undefined;

    const boolMatch = xml.match(/^<boolean\s*>(.*?)<\/boolean>/s);
    if (boolMatch) {
      const v = boolMatch[1].trim().toLowerCase();
      return new LLSD(v === 'true' || v === '1' || v === 't');
    }

    const intMatch = xml.match(/^<integer\s*>(.*?)<\/integer>/s);
    if (intMatch) {
      return new LLSD(BigInt(intMatch[1].trim()));
    }

    const realMatch = xml.match(/^<real\s*>(.*?)<\/real>/s);
    if (realMatch) {
      const v = realMatch[1].trim().toLowerCase();
      if (v === 'nan') return new LLSD(NaN);
      if (v === 'inf' || v === '+inf' || v === 'infinity') return new LLSD(Infinity);
      if (v === '-inf' || v === '-infinity') return new LLSD(-Infinity);
      return new LLSD(parseFloat(v));
    }

    if (xml.startsWith('<string/>') || xml.startsWith('<string />')) return new LLSD('');
    const strMatch = xml.match(/^<string\s*>(.*?)<\/string>/s);
    if (strMatch) {
      return new LLSD(this.xmlUnescape(strMatch[1]));
    }

    if (xml.startsWith('<uuid/>') || xml.startsWith('<uuid />')) return new LLSD(LLUUID.nullUuid);
    const uuidMatch = xml.match(/^<uuid\s*>(.*?)<\/uuid>/s);
    if (uuidMatch) {
      return new LLSD(new LLUUID(uuidMatch[1].trim()));
    }

    const dateMatch = xml.match(/^<date\s*>(.*?)<\/date>/s);
    if (dateMatch) {
      return new LLSD(new LLDate(dateMatch[1].trim()));
    }

    const uriMatch = xml.match(/^<uri\s*>(.*?)<\/uri>/s);
    if (uriMatch) {
      return new LLSD(new LLURI(this.xmlUnescape(uriMatch[1].trim())));
    }

    if (xml.startsWith('<binary/>') || xml.startsWith('<binary />')) return new LLSD(new Uint8Array(0));
    const binMatch = xml.match(/^<binary(?:\s+encoding="([^"]*)")?\s*>(.*?)<\/binary>/s);
    if (binMatch) {
      const encoding = (binMatch[1] || 'base64').toLowerCase();
      const content = binMatch[2].trim();
      if (encoding === 'base16') {
        const bytes = new Uint8Array(content.length / 2);
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = parseInt(content.substring(i * 2, i * 2 + 2), 16);
        }
        return new LLSD(bytes);
      } else {
        const buf = Buffer.from(content, 'base64');
        return new LLSD(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      }
    }

    if (xml.startsWith('<map>') || xml.startsWith('<map/>')) {
      if (xml.startsWith('<map/>')) return LLSD.emptyMap();
      const map = new Map<string, LLSD>();
      let inner = xml.substring(5, xml.lastIndexOf('</map>')).trim();
      while (inner.length > 0) {
        const keyMatch = inner.match(/^<key\s*>(.*?)<\/key>/s);
        if (!keyMatch) break;
        const key = this.xmlUnescape(keyMatch[1]);
        inner = inner.substring(keyMatch[0].length).trim();
        const valueEndIdx = this.findMatchingXmlEndTag(inner);
        if (valueEndIdx === -1) break;
        const valXml = inner.substring(0, valueEndIdx);
        map.set(key, this.parseXmlValue(valXml));
        inner = inner.substring(valueEndIdx).trim();
      }
      return new LLSD(map);
    }

    if (xml.startsWith('<array>') || xml.startsWith('<array/>')) {
      if (xml.startsWith('<array/>')) return LLSD.emptyArray();
      const arr: LLSD[] = [];
      let inner = xml.substring(7, xml.lastIndexOf('</array>')).trim();
      while (inner.length > 0) {
        const valueEndIdx = this.findMatchingXmlEndTag(inner);
        if (valueEndIdx === -1) break;
        const valXml = inner.substring(0, valueEndIdx);
        arr.push(this.parseXmlValue(valXml));
        inner = inner.substring(valueEndIdx).trim();
      }
      return new LLSD(arr);
    }

    return LLSD.undefined;
  }

  private static findMatchingXmlEndTag(xml: string): number {
    xml = xml.trimStart();
    if (!xml.startsWith('<')) return -1;
    if (xml.startsWith('<?')) {
      const idx = xml.indexOf('?>');
      return idx !== -1 ? idx + 2 : -1;
    }
    const spaceIdx = xml.indexOf(' ');
    const closeAngleIdx = xml.indexOf('>');
    if (closeAngleIdx === -1) return -1;
    let tagName = '';
    if (spaceIdx !== -1 && spaceIdx < closeAngleIdx) {
      tagName = xml.substring(1, spaceIdx);
    } else {
      tagName = xml.substring(1, closeAngleIdx);
    }
    if (tagName.endsWith('/')) {
      return closeAngleIdx + 1;
    }
    if (xml.substring(0, closeAngleIdx + 1).endsWith('/>')) {
      return closeAngleIdx + 1;
    }

    const closingTag = `</${tagName}>`;
    let depth = 0;
    let pos = 0;

    while (pos < xml.length) {
      const nextOpen = xml.indexOf(`<${tagName}`, pos);
      const nextClose = xml.indexOf(closingTag, pos);

      if (nextClose === -1) return -1;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        const endOpenAngle = xml.indexOf('>', nextOpen);
        if (endOpenAngle !== -1 && xml[endOpenAngle - 1] === '/') {
          pos = endOpenAngle + 1;
        } else {
          depth++;
          pos = endOpenAngle + 1;
        }
      } else {
        depth--;
        pos = nextClose + closingTag.length;
        if (depth === 0) return pos;
      }
    }
    return -1;
  }

  private static xmlUnescape(s: string): string {
    return s.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
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
      case LLSDType.Undefined:
        chunks.push(new Uint8Array([33])); // '!'
        break;
      case LLSDType.Boolean:
        chunks.push(new Uint8Array([sd.asBoolean() ? 49 : 48])); // '1' or '0'
        break;
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
      case LLSDType.String: {
        const utf8 = Buffer.from(sd.asString(), 'utf-8');
        const buf = new Uint8Array(5 + utf8.length);
        buf[0] = 115; // 's'
        const dv = new DataView(buf.buffer, 1, 4);
        dv.setInt32(0, utf8.length, false);
        buf.set(utf8, 5);
        chunks.push(buf);
        break;
      }
      case LLSDType.UUID: {
        const buf = new Uint8Array(17);
        buf[0] = 117; // 'u'
        buf.set(sd.asUUID().bytes, 1);
        chunks.push(buf);
        break;
      }
      case LLSDType.Date: {
        const buf = new Uint8Array(9);
        buf[0] = 100; // 'd'
        const dv = new DataView(buf.buffer, 1, 8);
        dv.setFloat64(0, sd.asDate().secondsSinceEpoch, true); // Date is LE 8-byte double!
        chunks.push(buf);
        break;
      }
      case LLSDType.URI: {
        const utf8 = Buffer.from(sd.asURI().asString(), 'utf-8');
        const buf = new Uint8Array(5 + utf8.length);
        buf[0] = 108; // 'l'
        const dv = new DataView(buf.buffer, 1, 4);
        dv.setInt32(0, utf8.length, false);
        buf.set(utf8, 5);
        chunks.push(buf);
        break;
      }
      case LLSDType.Binary: {
        const bin = sd.asBinary();
        const buf = new Uint8Array(5 + bin.length);
        buf[0] = 98; // 'b'
        const dv = new DataView(buf.buffer, 1, 4);
        dv.setInt32(0, bin.length, false);
        buf.set(bin, 5);
        chunks.push(buf);
        break;
      }
      case LLSDType.Map: {
        const map = (sd as any).value as Map<string, LLSD>;
        const header = new Uint8Array(5);
        header[0] = 123; // '{'
        const dv = new DataView(header.buffer, 1, 4);
        const entries = map ? Array.from(map.entries()) : [];
        dv.setInt32(0, entries.length, false);
        chunks.push(header);

        for (const [k, v] of entries) {
          const kUtf8 = Buffer.from(k, 'utf-8');
          const kBuf = new Uint8Array(5 + kUtf8.length);
          kBuf[0] = 107; // 'k'
          const kDv = new DataView(kBuf.buffer, 1, 4);
          kDv.setInt32(0, kUtf8.length, false);
          kBuf.set(kUtf8, 5);
          chunks.push(kBuf);
          this.writeBinary(chunks, v);
        }
        chunks.push(new Uint8Array([125])); // '}'
        break;
      }
      case LLSDType.Array: {
        const arr = (sd as any).value as LLSD[];
        const header = new Uint8Array(5);
        header[0] = 91; // '['
        const dv = new DataView(header.buffer, 1, 4);
        const items = arr || [];
        dv.setInt32(0, items.length, false);
        chunks.push(header);

        for (const item of items) {
          this.writeBinary(chunks, item);
        }
        chunks.push(new Uint8Array([93])); // ']'
        break;
      }
    }
  }

  public static fromBinary(bytes: Uint8Array): LLSD {
    if (bytes.length === 0) return LLSD.undefined;

    let offset = 0;
    if (bytes.length >= 2 && bytes[0] === 60 && bytes[1] === 63) { // '<?'
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 10) { // '\n'
          offset = i + 1;
          break;
        }
      }
    }

    const res = this.readBinaryValue(bytes, offset);
    return res.value;
  }

  private static readBinaryValue(bytes: Uint8Array, offset: number): { value: LLSD; offset: number } {
    if (offset >= bytes.length) return { value: LLSD.undefined, offset };
    const tag = bytes[offset++];
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    switch (tag) {
      case 33: // '!'
        return { value: LLSD.undefined, offset };
      case 49: // '1'
        return { value: new LLSD(true), offset };
      case 48: // '0'
        return { value: new LLSD(false), offset };
      case 105: { // 'i'
        if (offset + 4 > bytes.length) return { value: LLSD.undefined, offset: bytes.length };
        const val = dv.getInt32(offset, false);
        return { value: new LLSD(BigInt(val)), offset: offset + 4 };
      }
      case 114: { // 'r'
        if (offset + 8 > bytes.length) return { value: LLSD.undefined, offset: bytes.length };
        const val = dv.getFloat64(offset, false);
        return { value: new LLSD(val), offset: offset + 8 };
      }
      case 115: { // 's'
        if (offset + 4 > bytes.length) return { value: LLSD.undefined, offset: bytes.length };
        const len = dv.getInt32(offset, false);
        offset += 4;
        if (offset + len > bytes.length) return { value: LLSD.undefined, offset: bytes.length };
        const strBytes = bytes.subarray(offset, offset + len);
        const str = Buffer.from(strBytes.buffer, strBytes.byteOffset, strBytes.byteLength).toString('utf-8');
        return { value: new LLSD(str), offset: offset + len };
      }
      case 117: { // 'u'
        if (offset + 16 > bytes.length) return { value: LLSD.undefined, offset: bytes.length };
        const uuidBytes = bytes.subarray(offset, offset + 16);
        return { value: new LLSD(new LLUUID(uuidBytes)), offset: offset + 16 };
      }
      case 100: { // 'd'
        if (offset + 8 > bytes.length) return { value: LLSD.undefined, offset: bytes.length };
        const sec = dv.getFloat64(offset, true); // Date is LE 8-byte double!
        return { value: new LLSD(new LLDate(sec)), offset: offset + 8 };
      }
      case 108: { // 'l'
        if (offset + 4 > bytes.length) return { value: LLSD.undefined, offset: bytes.length };
        const len = dv.getInt32(offset, false);
        offset += 4;
        if (offset + len > bytes.length) return { value: LLSD.undefined, offset: bytes.length };
        const uriBytes = bytes.subarray(offset, offset + len);
        const uriStr = Buffer.from(uriBytes.buffer, uriBytes.byteOffset, uriBytes.byteLength).toString('utf-8');
        return { value: new LLSD(new LLURI(uriStr)), offset: offset + len };
      }
      case 98: { // 'b'
        if (offset + 4 > bytes.length) return { value: LLSD.undefined, offset: bytes.length };
        const len = dv.getInt32(offset, false);
        offset += 4;
        if (offset + len > bytes.length) return { value: LLSD.undefined, offset: bytes.length };
        const bin = new Uint8Array(bytes.subarray(offset, offset + len));
        return { value: new LLSD(bin), offset: offset + len };
      }
      case 123: { // '{'
        if (offset + 4 > bytes.length) return { value: LLSD.undefined, offset: bytes.length };
        const count = dv.getInt32(offset, false);
        offset += 4;
        const map = new Map<string, LLSD>();

        for (let i = 0; i < count; i++) {
          if (offset >= bytes.length) break;
          const kTag = bytes[offset++];
          if (kTag !== 107) { // 'k'
            return { value: LLSD.undefined, offset: bytes.length };
          }
          if (offset + 4 > bytes.length) return { value: LLSD.undefined, offset: bytes.length };
          const kLen = dv.getInt32(offset, false);
          offset += 4;
          if (offset + kLen > bytes.length) return { value: LLSD.undefined, offset: bytes.length };
          const kBytes = bytes.subarray(offset, offset + kLen);
          const key = Buffer.from(kBytes.buffer, kBytes.byteOffset, kBytes.byteLength).toString('utf-8');
          offset += kLen;

          const valRes = this.readBinaryValue(bytes, offset);
          map.set(key, valRes.value);
          offset = valRes.offset;
        }

        if (offset < bytes.length && bytes[offset] === 125) { // '}'
          offset++;
        }
        return { value: new LLSD(map), offset };
      }
      case 91: { // '['
        if (offset + 4 > bytes.length) return { value: LLSD.undefined, offset: bytes.length };
        const count = dv.getInt32(offset, false);
        offset += 4;
        const arr: LLSD[] = [];

        for (let i = 0; i < count; i++) {
          const valRes = this.readBinaryValue(bytes, offset);
          arr.push(valRes.value);
          offset = valRes.offset;
        }

        if (offset < bytes.length && bytes[offset] === 93) { // ']'
          offset++;
        }
        return { value: new LLSD(arr), offset };
      }
      default:
        return { value: LLSD.undefined, offset };
    }
  }

  // --- Notation ---
  public static toNotation(sd: LLSD): string {
    switch (sd.type) {
      case LLSDType.Undefined: return '!';
      case LLSDType.Boolean: return sd.asBoolean() ? 'true' : 'false';
      case LLSDType.Integer: return `i${sd.asBigInt()}`;
      case LLSDType.Real: {
        const r = sd.asReal();
        if (isNaN(r)) return 'rnan';
        if (!isFinite(r)) return r > 0 ? 'rinf' : 'r-inf';
        return `r${r}`;
      }
      case LLSDType.String: return `'${this.notationEscape(sd.asString())}'`;
      case LLSDType.UUID: return `u${sd.asUUID().toString()}`;
      case LLSDType.Date: return `d"${sd.asDate().toISOString()}"`;
      case LLSDType.URI: return `l"${this.notationEscapeDouble(sd.asURI().asString())}"`;
      case LLSDType.Binary: return `b64"${Buffer.from(sd.asBinary()).toString('base64')}"`;
      case LLSDType.Map: {
        const map = (sd as any).value as Map<string, LLSD>;
        const parts: string[] = [];
        if (map) {
          for (const [k, v] of map.entries()) {
            parts.push(`'${this.notationEscape(k)}':${this.toNotation(v)}`);
          }
        }
        return `{${parts.join(',')}}`;
      }
      case LLSDType.Array: {
        const arr = (sd as any).value as LLSD[];
        const parts: string[] = [];
        if (arr) {
          for (const v of arr) {
            parts.push(this.toNotation(v));
          }
        }
        return `[${parts.join(',')}]`;
      }
    }
  }

  private static notationEscape(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private static notationEscapeDouble(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  public static fromNotation(text: string): LLSD {
    if (!text) return LLSD.undefined;
    let clean = text;
    if (clean.startsWith('<?llsd/notation?>') || clean.startsWith('<? llsd/notation ?>')) {
      const nl = clean.indexOf('\n');
      if (nl >= 0) clean = clean.substring(nl + 1);
    }
    return new NotationParser(clean).parse();
  }
}

class NotationParser {
  private pos = 0;

  constructor(private readonly text: string) {}

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
    return this.text[this.pos++];
  }

  private expect(c: string): void {
    if (this.pos >= this.text.length || this.text[this.pos] !== c) {
      throw new Error(`Expected '${c}' at pos ${this.pos}, found '${this.peek()}'`);
    }
    this.pos++;
  }

  public parseValue(): LLSD {
    this.skipWs();
    const c = this.peek();

    if (c === '!') {
      this.consume();
      return LLSD.undefined;
    }
    if (c === 'T' || c === 't') return this.parseBoolWord(true);
    if (c === 'F' || c === 'f') return this.parseBoolWord(false);
    if (c === '1') { this.consume(); return new LLSD(true); }
    if (c === '0') { this.consume(); return new LLSD(false); }
    if (c === 'i') {
      this.consume();
      const numStr = this.parseNumberWord();
      return new LLSD(BigInt(numStr || '0'));
    }
    if (c === 'r') {
      this.consume();
      const word = this.parseNumberWord();
      if (word.toLowerCase() === 'nan') return new LLSD(NaN);
      if (word.toLowerCase() === 'inf' || word.toLowerCase() === '+inf') return new LLSD(Infinity);
      if (word.toLowerCase() === '-inf') return new LLSD(-Infinity);
      return new LLSD(parseFloat(word));
    }
    if (c === 'u') {
      this.consume();
      const uuidStr = this.parseUuidLiteral();
      return new LLSD(new LLUUID(uuidStr));
    }
    if (c === 'd') {
      this.consume();
      const str = this.parseQuotedAfterTag();
      return new LLSD(new LLDate(str));
    }
    if (c === 'l') {
      this.consume();
      const str = this.parseQuotedAfterTag();
      return new LLSD(new LLURI(str));
    }
    if (c === 'b') return this.parseBinaryNotation();
    if (c === 's') return this.parseSizedString();
    if (c === '\'') return new LLSD(this.parseSingleQuoted());
    if (c === '"') return new LLSD(this.parseDoubleQuoted());
    if (c === '{') return this.parseMap();
    if (c === '[') return this.parseArray();

    if (c !== '') this.consume();
    return LLSD.undefined;
  }

  private parseBoolWord(val: boolean): LLSD {
    const word = val ? 'true' : 'false';
    const sub = this.text.substring(this.pos, this.pos + word.length);
    if (sub.toLowerCase() === word) {
      this.pos += word.length;
    } else {
      this.consume();
    }
    return new LLSD(val);
  }

  private parseNumberWord(): string {
    const start = this.pos;
    while (this.pos < this.text.length) {
      const c = this.text[this.pos];
      if (/\s/.test(c) || c === ',' || c === '}' || c === ']') break;
      this.pos++;
    }
    return this.text.substring(start, this.pos);
  }

  private parseUuidLiteral(): string {
    this.skipWs();
    if (this.peek() === '"') return this.parseDoubleQuoted();
    if (this.peek() === '\'') return this.parseSingleQuoted();
    const start = this.pos;
    const end = Math.min(start + 36, this.text.length);
    this.pos = end;
    return this.text.substring(start, end);
  }

  private parseQuotedAfterTag(): string {
    this.skipWs();
    if (this.peek() === '"') return this.parseDoubleQuoted();
    if (this.peek() === '\'') return this.parseSingleQuoted();
    return '';
  }

  private parseDoubleQuoted(): string {
    this.expect('"');
    let res = '';
    while (this.pos < this.text.length && this.text[this.pos] !== '"') {
      if (this.text[this.pos] === '\\' && this.pos + 1 < this.text.length) {
        this.pos++;
        res += this.decodeEscape(this.text[this.pos]);
      } else {
        res += this.text[this.pos];
      }
      this.pos++;
    }
    if (this.pos < this.text.length) this.pos++;
    return res;
  }

  private parseSingleQuoted(): string {
    this.expect('\'');
    let res = '';
    while (this.pos < this.text.length && this.text[this.pos] !== '\'') {
      if (this.text[this.pos] === '\\' && this.pos + 1 < this.text.length) {
        this.pos++;
        res += this.decodeEscape(this.text[this.pos]);
      } else {
        res += this.text[this.pos];
      }
      this.pos++;
    }
    if (this.pos < this.text.length) this.pos++;
    return res;
  }

  private decodeEscape(c: string): string {
    if (c === 'n') return '\n';
    if (c === 't') return '\t';
    if (c === 'r') return '\r';
    return c;
  }

  private parseSizedString(): LLSD {
    this.consume(); // 's'
    if (this.peek() === '(') {
      this.consume();
      const numStart = this.pos;
      while (this.pos < this.text.length && this.text[this.pos] !== ')') this.pos++;
      const size = parseInt(this.text.substring(numStart, this.pos), 10) || 0;
      if (this.pos < this.text.length) this.consume(); // ')'
      if (this.pos < this.text.length && (this.text[this.pos] === '"' || this.text[this.pos] === '\'')) this.consume();
      const end = Math.min(this.pos + size, this.text.length);
      const s = this.text.substring(this.pos, end);
      this.pos = end;
      if (this.pos < this.text.length && (this.text[this.pos] === '"' || this.text[this.pos] === '\'')) this.consume();
      return new LLSD(s);
    }
    if (this.peek() === '"') return new LLSD(this.parseDoubleQuoted());
    if (this.peek() === '\'') return new LLSD(this.parseSingleQuoted());
    return new LLSD('');
  }

  private parseBinaryNotation(): LLSD {
    this.consume(); // 'b'
    if (this.peekAt(0) === '6' && this.peekAt(1) === '4') {
      this.pos += 2;
      const data = this.parseQuotedAfterTag();
      const buf = Buffer.from(data, 'base64');
      return new LLSD(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    }
    if (this.peekAt(0) === '1' && this.peekAt(1) === '6') {
      this.pos += 2;
      const data = this.parseQuotedAfterTag();
      const bytes = new Uint8Array(data.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(data.substring(i * 2, i * 2 + 2), 16);
      }
      return new LLSD(bytes);
    }
    if (this.peekAt(0) === '(') {
      this.consume(); // '('
      const numStart = this.pos;
      while (this.pos < this.text.length && this.text[this.pos] !== ')') this.pos++;
      const size = parseInt(this.text.substring(numStart, this.pos), 10) || 0;
      if (this.pos < this.text.length) this.consume(); // ')'
      if (this.pos < this.text.length && (this.text[this.pos] === '"' || this.text[this.pos] === '\'')) this.consume();
      const end = Math.min(this.pos + size, this.text.length);
      const bytes = new Uint8Array(end - this.pos);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = this.text.charCodeAt(this.pos + i);
      }
      this.pos = end;
      if (this.pos < this.text.length && (this.text[this.pos] === '"' || this.text[this.pos] === '\'')) this.consume();
      return new LLSD(bytes);
    }
    return new LLSD(new Uint8Array(0));
  }

  private parseMap(): LLSD {
    this.consume(); // '{'
    const map = new Map<string, LLSD>();
    this.skipWs();
    while (this.pos < this.text.length && this.peek() !== '}') {
      this.skipWs();
      let key = '';
      const c = this.peek();
      if (c === '\'') key = this.parseSingleQuoted();
      else if (c === '"') key = this.parseDoubleQuoted();
      else if (c === 's') key = this.parseSizedString().asString();
      else key = this.parseNumberWord();

      this.skipWs();
      if (this.peek() === ':') this.consume();
      this.skipWs();
      map.set(key, this.parseValue());
      this.skipWs();
      if (this.peek() === ',') this.consume();
      this.skipWs();
    }
    if (this.pos < this.text.length) this.consume(); // '}'
    return new LLSD(map);
  }

  private parseArray(): LLSD {
    this.consume(); // '['
    const arr: LLSD[] = [];
    this.skipWs();
    while (this.pos < this.text.length && this.peek() !== ']') {
      arr.push(this.parseValue());
      this.skipWs();
      if (this.peek() === ',') this.consume();
      this.skipWs();
    }
    if (this.pos < this.text.length) this.consume(); // ']'
    return new LLSD(arr);
  }
}
