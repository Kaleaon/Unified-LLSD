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
      case LLSDType.Date: {
        const d = sd.asDate();
        return d.isNull ? '<date/>' : `<date>${d.toISOString()}</date>`;
      }
      case LLSDType.URI: {
        const u = sd.asURI().asString();
        return u ? `<uri>${this.xmlEscape(u)}</uri>` : '<uri/>';
      }
      case LLSDType.Binary: {
        const b = sd.asBinary();
        return b.length > 0 ? `<binary encoding="base64">${Buffer.from(b).toString('base64')}</binary>` : '<binary/>';
      }
      case LLSDType.Map: {
        const val = (sd as any).value;
        if (val instanceof Map) {
          if (val.size === 0) return '<map/>';
          let res = '<map>';
          val.forEach((v: any, k: any) => {
            res += `<key>${this.xmlEscape(String(k))}</key>`;
            res += this.writeXmlElement(v instanceof LLSD ? v : new LLSD(v));
          });
          res += '</map>';
          return res;
        } else if (typeof val === 'object' && val !== null) {
          const keys = Object.keys(val);
          if (keys.length === 0) return '<map/>';
          let res = '<map>';
          for (const k of keys) {
            res += `<key>${this.xmlEscape(k)}</key>`;
            res += this.writeXmlElement(val[k] instanceof LLSD ? val[k] : new LLSD(val[k]));
          }
          res += '</map>';
          return res;
        }
        return '<map/>';
      }
      case LLSDType.Array: {
        const val = (sd as any).value;
        if (Array.isArray(val)) {
          if (val.length === 0) return '<array/>';
          let res = '<array>';
          for (const item of val) {
            res += this.writeXmlElement(item instanceof LLSD ? item : new LLSD(item));
          }
          res += '</array>';
          return res;
        }
        return '<array/>';
      }
    }
  }

  public static xmlEscape(s: string): string {
    return s.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
  }

  public static xmlUnescape(s: string): string {
    let res = s.replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"')
               .replace(/&apos;/g, "'")
               .replace(/&#39;/g, "'")
               .replace(/&amp;/g, '&');
    if (res.includes('&#')) {
      res = this.decodeNumericEntities(res);
    }
    return res;
  }

  private static decodeNumericEntities(s: string): string {
    return s.replace(/&#(x[0-9a-fA-F]+|\d+);/g, (_, codeStr: string) => {
      let codePoint: number;
      if (codeStr.startsWith('x') || codeStr.startsWith('X')) {
        codePoint = parseInt(codeStr.substring(1), 16);
      } else {
        codePoint = parseInt(codeStr, 10);
      }
      if (!isNaN(codePoint) && codePoint >= 0 && codePoint <= 0x10FFFF) {
        return String.fromCodePoint(codePoint);
      }
      return _;
    });
  }

  public static fromXML(xml: string): LLSD {
    const parser = new LLSDXMLParser(xml);
    return parser.parse();
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

interface TagToken {
  name: string;
  attributes: Record<string, string>;
  isEnd: boolean;
  isSelfClosing: boolean;
}

class LLSDXMLParser {
  private readonly input: string;
  private pos = 0;
  private static readonly maxDepth = 256;

  constructor(input: string) {
    this.input = input || '';
  }

  public parse(): LLSD {
    while (this.pos < this.input.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.input.length) break;
      if (this.input[this.pos] === '<') {
        const tag = this.readTagToken();
        if (tag) {
          if (tag.isEnd) continue;
          if (tag.name.toLowerCase() === 'llsd') {
            if (tag.isSelfClosing) return LLSD.undefined;
            return this.parseValue(0);
          } else {
            return this.parseElement(tag, 0);
          }
        }
      } else {
        this.pos++;
      }
    }
    return LLSD.undefined;
  }

  private parseValue(depth: number): LLSD {
    if (depth > LLSDXMLParser.maxDepth) return LLSD.undefined;
    while (this.pos < this.input.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.input.length) break;
      if (this.input[this.pos] === '<') {
        const saved = this.pos;
        const tag = this.readTagToken();
        if (tag) {
          if (tag.isEnd) {
            if (tag.name.toLowerCase() === 'llsd') return LLSD.undefined;
            return LLSD.undefined;
          }
          return this.parseElement(tag, depth);
        } else {
          this.pos = saved;
          break;
        }
      } else {
        this.pos++;
      }
    }
    return LLSD.undefined;
  }

  private parseElement(tag: TagToken, depth: number): LLSD {
    if (depth > LLSDXMLParser.maxDepth) return LLSD.undefined;
    const name = tag.name.toLowerCase();

    if (tag.isSelfClosing) {
      switch (name) {
        case 'undef': return LLSD.undefined;
        case 'boolean': return new LLSD(false);
        case 'integer': return new LLSD(0n);
        case 'real': return new LLSD(0.0);
        case 'string': return new LLSD('');
        case 'uuid': return new LLSD(LLUUID.nullUuid);
        case 'date': return new LLSD(LLDate.nullDate);
        case 'uri': return new LLSD(new LLURI(''));
        case 'binary': return new LLSD(new Uint8Array(0));
        case 'map': return LLSD.emptyMap();
        case 'array': return LLSD.emptyArray();
        default: return LLSD.undefined;
      }
    }

    switch (name) {
      case 'undef':
        this.readContentUntilEndTag(name);
        return LLSD.undefined;
      case 'boolean': {
        const raw = this.readContentUntilEndTag(name).trim().toLowerCase();
        return new LLSD(raw === 'true' || raw === '1');
      }
      case 'integer': {
        const raw = this.readContentUntilEndTag(name).trim();
        try {
          return new LLSD(BigInt(raw));
        } catch {
          return new LLSD(0n);
        }
      }
      case 'real': {
        const raw = this.readContentUntilEndTag(name).trim().toLowerCase();
        if (raw === 'nan') return new LLSD(NaN);
        if (raw === 'inf' || raw === '+inf') return new LLSD(Infinity);
        if (raw === '-inf') return new LLSD(-Infinity);
        const val = parseFloat(raw);
        return new LLSD(isNaN(val) ? 0.0 : val);
      }
      case 'string': {
        const raw = this.readContentUntilEndTag(name);
        return new LLSD(LLSDSerialize.xmlUnescape(raw));
      }
      case 'uuid': {
        const raw = this.readContentUntilEndTag(name).trim();
        return new LLSD(new LLUUID(raw));
      }
      case 'date': {
        const raw = this.readContentUntilEndTag(name).trim();
        return new LLSD(new LLDate(raw));
      }
      case 'uri': {
        const raw = this.readContentUntilEndTag(name).trim();
        return new LLSD(new LLURI(LLSDSerialize.xmlUnescape(raw)));
      }
      case 'binary': {
        const raw = this.readContentUntilEndTag(name)
          .replace(/\n/g, '')
          .replace(/\r/g, '')
          .replace(/ /g, '')
          .replace(/\t/g, '');
        try {
          const buf = Buffer.from(raw, 'base64');
          return new LLSD(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
        } catch {
          return new LLSD(new Uint8Array(0));
        }
      }
      case 'map': {
        const map = new Map<string, LLSD>();
        while (this.pos < this.input.length) {
          this.skipWhitespaceAndComments();
          if (this.pos >= this.input.length) break;
          if (this.input[this.pos] === '<') {
            const childTag = this.readTagToken();
            if (childTag) {
              if (childTag.isEnd) {
                if (childTag.name.toLowerCase() === 'map') {
                  return new LLSD(map);
                }
                continue;
              }
              if (childTag.name.toLowerCase() === 'key') {
                let keyName: string;
                if (childTag.isSelfClosing) {
                  keyName = '';
                } else {
                  const rawKey = this.readContentUntilEndTag('key');
                  keyName = LLSDSerialize.xmlUnescape(rawKey);
                }
                const val = this.parseValue(depth + 1);
                map.set(keyName, val);
              }
            }
          } else {
            this.pos++;
          }
        }
        return new LLSD(map);
      }
      case 'array': {
        const array: LLSD[] = [];
        while (this.pos < this.input.length) {
          this.skipWhitespaceAndComments();
          if (this.pos >= this.input.length) break;
          if (this.input[this.pos] === '<') {
            const childTag = this.readTagToken();
            if (childTag) {
              if (childTag.isEnd) {
                if (childTag.name.toLowerCase() === 'array') {
                  return new LLSD(array);
                }
                continue;
              }
              const childVal = this.parseElement(childTag, depth + 1);
              array.push(childVal);
            }
          } else {
            this.pos++;
          }
        }
        return new LLSD(array);
      }
      default:
        return LLSD.undefined;
    }
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.pos++;
        continue;
      }
      if (ch === '<') {
        const rest = this.input.substring(this.pos);
        if (rest.startsWith('<!--')) {
          const endIdx = this.input.indexOf('-->', this.pos);
          if (endIdx !== -1) {
            this.pos = endIdx + 3;
            continue;
          } else {
            this.pos = this.input.length;
            break;
          }
        }
        if (rest.startsWith('<?')) {
          const endIdx = this.input.indexOf('?>', this.pos);
          if (endIdx !== -1) {
            this.pos = endIdx + 2;
            continue;
          } else {
            this.pos = this.input.length;
            break;
          }
        }
      }
      break;
    }
  }

  private readTagToken(): TagToken | null {
    if (this.pos >= this.input.length || this.input[this.pos] !== '<') return null;
    const closeIdx = this.input.indexOf('>', this.pos);
    if (closeIdx === -1) return null;
    const tagContent = this.input.substring(this.pos + 1, closeIdx).trim();
    this.pos = closeIdx + 1;

    if (tagContent.startsWith('/')) {
      const name = tagContent.substring(1).trim();
      return { name, attributes: {}, isEnd: true, isSelfClosing: false };
    }

    let isSelfClosing = false;
    let content = tagContent;
    if (content.endsWith('/')) {
      isSelfClosing = true;
      content = content.substring(0, content.length - 1).trim();
    }

    const spaceMatch = content.match(/\s/);
    const spaceIdx = spaceMatch ? spaceMatch.index! : -1;
    const tagName = spaceIdx === -1 ? content : content.substring(0, spaceIdx);

    const attrs: Record<string, string> = {};
    if (spaceIdx !== -1) {
      const attrStr = content.substring(spaceIdx).trim();
      const attrRegex = /(\w+)=["']([^"']*)["']/g;
      let match: RegExpExecArray | null;
      while ((match = attrRegex.exec(attrStr)) !== null) {
        attrs[match[1]] = match[2];
      }
    }

    return { name: tagName, attributes: attrs, isEnd: false, isSelfClosing };
  }

  private readContentUntilEndTag(tagName: string): string {
    const endTagLower = `</${tagName.toLowerCase()}>`;
    const endTagLowerSpace = `</${tagName.toLowerCase()} `;

    let content = '';
    while (this.pos < this.input.length) {
      const restLower = this.input.substring(this.pos).toLowerCase();
      if (restLower.startsWith(endTagLower) || restLower.startsWith(endTagLowerSpace)) {
        const closeIdx = this.input.indexOf('>', this.pos);
        if (closeIdx !== -1) {
          this.pos = closeIdx + 1;
        } else {
          this.pos = this.input.length;
        }
        break;
      }

      if (this.input.substring(this.pos).startsWith('<![CDATA[')) {
        this.pos += 9;
        const cdataEnd = this.input.indexOf(']]>', this.pos);
        if (cdataEnd !== -1) {
          content += this.input.substring(this.pos, cdataEnd);
          this.pos = cdataEnd + 3;
        } else {
          content += this.input.substring(this.pos);
          this.pos = this.input.length;
        }
        continue;
      }

      if (this.input.substring(this.pos).startsWith('<!--')) {
        const commentEnd = this.input.indexOf('-->', this.pos);
        if (commentEnd !== -1) {
          this.pos = commentEnd + 3;
        } else {
          this.pos = this.input.length;
        }
        continue;
      }

      content += this.input[this.pos];
      this.pos++;
    }
    return content;
  }
}
