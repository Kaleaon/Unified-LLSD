import { LLSD, LLSDType } from './llsd.js';
import { LLUUID } from './lluuid.js';
import { LLDate } from './lldate.js';
import { LLURI } from './lluri.js';

interface XmlTagToken {
  type: 'tag';
  name: string;
  isClose: boolean;
  isSelfClosing: boolean;
  attributes: Record<string, string>;
}

interface XmlTextToken {
  type: 'text';
  text: string;
}

type XmlToken = XmlTagToken | XmlTextToken;

export class XmlCodec {
  public static readonly xmlHeader = "<?xml version=\"1.0\" ?>\n";

  public static encode(sd: LLSD, withDeclaration = false): string {
    return this.toXML(sd, withDeclaration);
  }

  public static toXML(sd: LLSD, withDeclaration = false): string {
    let xml = withDeclaration ? this.xmlHeader : '';
    xml += '<llsd>';
    xml += this.writeXmlElement(sd);
    xml += '</llsd>';
    return xml;
  }

  private static writeXmlElement(sd: LLSD): string {
    switch (sd.type) {
      case LLSDType.Undefined:
        return '<undef/>';
      case LLSDType.Boolean:
        return `<boolean>${sd.asBoolean() ? 'true' : 'false'}</boolean>`;
      case LLSDType.Integer:
        return `<integer>${sd.asBigInt()}</integer>`;
      case LLSDType.Real: {
        const r = sd.asReal();
        if (Number.isNaN(r)) return '<real>nan</real>';
        if (!Number.isFinite(r)) return `<real>${r > 0 ? 'inf' : '-inf'}</real>`;
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
      case LLSDType.Date:
        return `<date>${sd.asDate().toISOString()}</date>`;
      case LLSDType.URI: {
        const u = sd.asURI().asString();
        return u ? `<uri>${this.xmlEscape(u)}</uri>` : '<uri/>';
      }
      case LLSDType.Binary: {
        const bin = sd.asBinary();
        if (bin.length === 0) return '<binary/>';
        return `<binary encoding="base64">${Buffer.from(bin).toString('base64')}</binary>`;
      }
      case LLSDType.Map: {
        const map = sd.asMap();
        if (map.size === 0) return '<map/>';
        let res = '<map>';
        for (const [key, val] of map.entries()) {
          res += `<key>${this.xmlEscape(key)}</key>${this.writeXmlElement(val)}`;
        }
        res += '</map>';
        return res;
      }
      case LLSDType.Array: {
        const arr = sd.asArray();
        if (arr.length === 0) return '<array/>';
        let res = '<array>';
        for (const item of arr) {
          res += this.writeXmlElement(item);
        }
        res += '</array>';
        return res;
      }
      default:
        return '<undef/>';
    }
  }

  private static xmlEscape(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  public static decode(xml: string): LLSD {
    return this.fromXML(xml);
  }

  public static fromXML(xml: string): LLSD {
    if (!xml || !xml.trim()) return LLSD.undefined;
    const tokens = this.tokenize(xml);
    const parser = new XmlParser(tokens);
    return parser.parse();
  }

  private static tokenize(xml: string): XmlToken[] {
    const tokens: XmlToken[] = [];
    let i = 0;
    const len = xml.length;

    while (i < len) {
      if (xml[i] === '<') {
        if (xml.startsWith('<!--', i)) {
          const end = xml.indexOf('-->', i + 4);
          if (end === -1) break;
          i = end + 3;
          continue;
        }
        if (xml.startsWith('<?', i)) {
          const end = xml.indexOf('?>', i + 2);
          if (end === -1) break;
          i = end + 2;
          continue;
        }
        if (xml.startsWith('<![CDATA[', i)) {
          const end = xml.indexOf(']]>', i + 9);
          const cdataText = end === -1 ? xml.substring(i + 9) : xml.substring(i + 9, end);
          tokens.push({ type: 'text', text: cdataText });
          i = end === -1 ? len : end + 3;
          continue;
        }
        if (xml.startsWith('<!', i)) {
          const end = xml.indexOf('>', i + 2);
          if (end === -1) break;
          i = end + 1;
          continue;
        }

        const tagEnd = xml.indexOf('>', i + 1);
        if (tagEnd === -1) break;

        const tagStr = xml.substring(i + 1, tagEnd).trim();
        i = tagEnd + 1;

        if (!tagStr) continue;

        const isClose = tagStr.startsWith('/');
        const isSelfClosing = tagStr.endsWith('/') && !isClose;

        let cleanTagStr = tagStr;
        if (isClose) cleanTagStr = cleanTagStr.substring(1).trim();
        if (isSelfClosing) cleanTagStr = cleanTagStr.substring(0, cleanTagStr.length - 1).trim();

        const spaceIdx = cleanTagStr.search(/\s/);
        let name = '';
        const attributes: Record<string, string> = {};

        if (spaceIdx === -1) {
          name = cleanTagStr.toLowerCase();
        } else {
          name = cleanTagStr.substring(0, spaceIdx).toLowerCase();
          const attrStr = cleanTagStr.substring(spaceIdx + 1);
          const attrRegex = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
          let match: RegExpExecArray | null;
          while ((match = attrRegex.exec(attrStr)) !== null) {
            attributes[match[1].toLowerCase()] = match[2] !== undefined ? match[2] : match[3];
          }
        }

        tokens.push({
          type: 'tag',
          name,
          isClose,
          isSelfClosing,
          attributes,
        });
      } else {
        const nextTag = xml.indexOf('<', i);
        const textChunk = nextTag === -1 ? xml.substring(i) : xml.substring(i, nextTag);
        i = nextTag === -1 ? len : nextTag;

        const unescaped = this.xmlUnescape(textChunk);
        tokens.push({ type: 'text', text: unescaped });
      }
    }

    return tokens;
  }

  private static xmlUnescape(s: string): string {
    return s
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
}

class XmlParser {
  private pos = 0;

  constructor(private tokens: XmlToken[]) {}

  public parse(): LLSD {
    this.skipWhitespaceTokens();
    if (this.pos >= this.tokens.length) return LLSD.undefined;

    const token = this.tokens[this.pos];
    if (token.type === 'tag' && token.name === 'llsd') {
      this.pos++;
      const val = this.parseValue();
      this.skipWhitespaceTokens();
      if (this.pos < this.tokens.length) {
        const endTok = this.tokens[this.pos];
        if (endTok.type === 'tag' && endTok.name === 'llsd' && endTok.isClose) {
          this.pos++;
        }
      }
      return val;
    }

    return this.parseValue();
  }

  private skipWhitespaceTokens() {
    while (this.pos < this.tokens.length) {
      const t = this.tokens[this.pos];
      if (t.type === 'text' && t.text.trim() === '') {
        this.pos++;
      } else {
        break;
      }
    }
  }

  private parseValue(): LLSD {
    this.skipWhitespaceTokens();
    if (this.pos >= this.tokens.length) return LLSD.undefined;

    const token = this.tokens[this.pos];
    if (token.type !== 'tag' || (token as XmlTagToken).isClose) {
      return LLSD.undefined;
    }

    const tag = token as XmlTagToken;
    this.pos++;

    if (tag.isSelfClosing) {
      return this.parseSelfClosingTag(tag);
    }

    switch (tag.name) {
      case 'undef':
        this.consumeCloseTag('undef');
        return LLSD.undefined;
      case 'boolean': {
        const text = this.consumeTextUntilClose('boolean');
        const t = text.trim().toLowerCase();
        return new LLSD(t === 'true' || t === '1' || t === 't' || t === '1.0');
      }
      case 'integer': {
        const text = this.consumeTextUntilClose('integer');
        try {
          return new LLSD(BigInt(text.trim()));
        } catch {
          return new LLSD(0n);
        }
      }
      case 'real': {
        const text = this.consumeTextUntilClose('real').trim().toLowerCase();
        if (text === 'nan') return new LLSD(NaN);
        if (text === 'inf' || text === '+inf' || text === 'infinity') return new LLSD(Infinity);
        if (text === '-inf' || text === '-infinity') return new LLSD(-Infinity);
        const parsed = parseFloat(text);
        return new LLSD(isNaN(parsed) ? 0 : parsed);
      }
      case 'string': {
        const text = this.consumeTextUntilClose('string');
        return new LLSD(text);
      }
      case 'uuid': {
        const text = this.consumeTextUntilClose('uuid').trim();
        return new LLSD(new LLUUID(text));
      }
      case 'date': {
        const text = this.consumeTextUntilClose('date').trim();
        return new LLSD(new LLDate(text));
      }
      case 'uri': {
        const text = this.consumeTextUntilClose('uri').trim();
        return new LLSD(new LLURI(text));
      }
      case 'binary': {
        const text = this.consumeTextUntilClose('binary').trim();
        const encoding = (tag.attributes['encoding'] || 'base64').toLowerCase();
        let bytes: Uint8Array;
        if (!text) {
          bytes = new Uint8Array(0);
        } else if (encoding === 'base16') {
          bytes = this.hexDecode(text);
        } else {
          bytes = new Uint8Array(Buffer.from(text, 'base64'));
        }
        return new LLSD(bytes);
      }
      case 'map': {
        const map = new Map<string, LLSD>();
        while (this.pos < this.tokens.length) {
          this.skipWhitespaceTokens();
          if (this.pos >= this.tokens.length) break;
          const current = this.tokens[this.pos];
          if (current.type === 'tag' && current.name === 'map' && current.isClose) {
            this.pos++;
            break;
          }
          if (current.type === 'tag' && current.name === 'key' && !current.isClose) {
            this.pos++;
            let keyName = '';
            if (current.isSelfClosing) {
              keyName = '';
            } else {
              keyName = this.consumeTextUntilClose('key');
            }
            const val = this.parseValue();
            map.set(keyName, val);
          } else {
            this.pos++;
          }
        }
        return new LLSD(map);
      }
      case 'array': {
        const arr: LLSD[] = [];
        while (this.pos < this.tokens.length) {
          this.skipWhitespaceTokens();
          if (this.pos >= this.tokens.length) break;
          const current = this.tokens[this.pos];
          if (current.type === 'tag' && current.name === 'array' && current.isClose) {
            this.pos++;
            break;
          }
          arr.push(this.parseValue());
        }
        return new LLSD(arr);
      }
      default:
        this.consumeCloseTag(tag.name);
        return LLSD.undefined;
    }
  }

  private parseSelfClosingTag(tag: XmlTagToken): LLSD {
    switch (tag.name) {
      case 'undef': return LLSD.undefined;
      case 'boolean': return new LLSD(false);
      case 'integer': return new LLSD(0n);
      case 'real': return new LLSD(0);
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

  private consumeTextUntilClose(tagName: string): string {
    let result = '';
    while (this.pos < this.tokens.length) {
      const t = this.tokens[this.pos];
      if (t.type === 'tag' && t.name === tagName && t.isClose) {
        this.pos++;
        break;
      }
      if (t.type === 'text') {
        result += t.text;
      }
      this.pos++;
    }
    return result;
  }

  private consumeCloseTag(tagName: string) {
    while (this.pos < this.tokens.length) {
      const t = this.tokens[this.pos];
      this.pos++;
      if (t.type === 'tag' && t.name === tagName && t.isClose) {
        break;
      }
    }
  }

  private hexDecode(s: string): Uint8Array {
    const clean = s.replace(/\s+/g, '');
    const bytes = new Uint8Array(Math.floor(clean.length / 2));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
}
