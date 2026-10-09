import { LLSD, LLSDType } from './llsd.js';
import { LLUUID } from './lluuid.js';
import { LLDate } from './lldate.js';
import { LLURI } from './lluri.js';

export class NotationCodec {
  public static readonly notationHeader = "<? llsd/notation ?>\n";

  public static encode(sd: LLSD): string {
    return this.toNotation(sd);
  }

  public static toNotation(sd: LLSD): string {
    switch (sd.type) {
      case LLSDType.Undefined:
        return '!';
      case LLSDType.Boolean:
        return sd.asBoolean() ? 'true' : 'false';
      case LLSDType.Integer:
        return `i${sd.asBigInt()}`;
      case LLSDType.Real: {
        const r = sd.asReal();
        if (Number.isNaN(r)) return 'rnan';
        if (!Number.isFinite(r)) return r > 0 ? 'rinf' : 'r-inf';
        return `r${r}`;
      }
      case LLSDType.String: {
        const s = sd.asString();
        let escaped = '';
        for (let i = 0; i < s.length; i++) {
          const c = s[i];
          if (c === '\\') escaped += '\\\\';
          else if (c === '\'') escaped += '\\\'';
          else escaped += c;
        }
        return `'${escaped}'`;
      }
      case LLSDType.UUID:
        return `u${sd.asUUID().toString()}`;
      case LLSDType.Date:
        return `d"${sd.asDate().toISOString()}"`;
      case LLSDType.URI: {
        const u = sd.asURI().asString();
        let escaped = '';
        for (let i = 0; i < u.length; i++) {
          const c = u[i];
          if (c === '\\') escaped += '\\\\';
          else if (c === '"') escaped += '\\"';
          else escaped += c;
        }
        return `l"${escaped}"`;
      }
      case LLSDType.Binary: {
        const bin = sd.asBinary();
        const b64 = Buffer.from(bin).toString('base64');
        return `b64"${b64}"`;
      }
      case LLSDType.Map: {
        const map = sd.asMap();
        let res = '{';
        let first = true;
        for (const [key, val] of map.entries()) {
          if (!first) res += ',';
          first = false;
          let kEscaped = '';
          for (let i = 0; i < key.length; i++) {
            const c = key[i];
            if (c === '\\') kEscaped += '\\\\';
            else if (c === '\'') kEscaped += '\\\'';
            else kEscaped += c;
          }
          res += `'${kEscaped}':${this.toNotation(val)}`;
        }
        res += '}';
        return res;
      }
      case LLSDType.Array: {
        const arr = sd.asArray();
        let res = '[';
        let first = true;
        for (const item of arr) {
          if (!first) res += ',';
          first = false;
          res += this.toNotation(item);
        }
        res += ']';
        return res;
      }
      default:
        return '!';
    }
  }

  public static decode(text: string): LLSD {
    return this.fromNotation(text);
  }

  public static fromNotation(text: string): LLSD {
    if (!text || !text.trim()) return LLSD.undefined;
    let clean = text.trim();
    if (clean.startsWith("<?llsd/notation?>") || clean.startsWith("<? llsd/notation ?>")) {
      const nl = clean.indexOf('\n');
      if (nl >= 0) clean = clean.substring(nl + 1).trim();
    }
    const parser = new NotationParser(clean);
    return parser.parse();
  }
}

class NotationParser {
  private pos = 0;

  constructor(private text: string) {}

  public parse(): LLSD {
    this.skipWs();
    return this.parseValue();
  }

  private skipWs() {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) {
      this.pos++;
    }
  }

  private peek(): string {
    return this.pos < this.text.length ? this.text[this.pos] : '\0';
  }

  private peekAt(offset: number): string {
    return this.pos + offset < this.text.length ? this.text[this.pos + offset] : '\0';
  }

  private consume(): string {
    return this.text[this.pos++];
  }

  public parseValue(): LLSD {
    this.skipWs();
    const c = this.peek();
    if (c === '!') {
      this.consume();
      return LLSD.undefined;
    }
    if (c === 't' || c === 'T') return this.parseBoolWord(true);
    if (c === 'f' || c === 'F') return this.parseBoolWord(false);
    if (c === '1') { this.consume(); return new LLSD(true); }
    if (c === '0') { this.consume(); return new LLSD(false); }
    if (c === 'i') {
      this.consume();
      const numStr = this.parseNumberWord();
      try {
        return new LLSD(BigInt(numStr));
      } catch {
        return new LLSD(0n);
      }
    }
    if (c === 'r') {
      this.consume();
      const numStr = this.parseNumberWord().toLowerCase();
      if (numStr === 'nan') return new LLSD(NaN);
      if (numStr === 'inf' || numStr === '+inf' || numStr === 'infinity') return new LLSD(Infinity);
      if (numStr === '-inf' || numStr === '-infinity') return new LLSD(-Infinity);
      const parsed = parseFloat(numStr);
      return new LLSD(isNaN(parsed) ? 0 : parsed);
    }
    if (c === 'u') {
      this.consume();
      const uuidStr = this.parseUuidLiteral();
      return new LLSD(new LLUUID(uuidStr));
    }
    if (c === 'd') {
      this.consume();
      const dateStr = this.parseQuotedAfterTag();
      return new LLSD(new LLDate(dateStr));
    }
    if (c === 'l') {
      this.consume();
      const uriStr = this.parseQuotedAfterTag();
      return new LLSD(new LLURI(uriStr));
    }
    if (c === 'b') {
      return this.parseBinaryNotation();
    }
    if (c === 's') {
      return this.parseSizedString();
    }
    if (c === '\'') {
      return new LLSD(this.parseSingleQuoted());
    }
    if (c === '"') {
      return new LLSD(this.parseDoubleQuoted());
    }
    if (c === '{') {
      return this.parseMap();
    }
    if (c === '[') {
      return this.parseArray();
    }

    if (c !== '\0') this.consume();
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
    const start = this.pos;
    const end = Math.min(start + 36, this.text.length);
    this.pos = end;
    return this.text.substring(start, end);
  }

  private parseQuotedAfterTag(): string {
    this.skipWs();
    const c = this.peek();
    if (c === '"') return this.parseDoubleQuoted();
    if (c === '\'') return this.parseSingleQuoted();
    return '';
  }

  private parseDoubleQuoted(): string {
    if (this.peek() === '"') this.consume();
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
    if (this.pos < this.text.length && this.text[this.pos] === '"') this.pos++;
    return res;
  }

  private parseSingleQuoted(): string {
    if (this.peek() === '\'') this.consume();
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
    if (this.pos < this.text.length && this.text[this.pos] === '\'') this.pos++;
    return res;
  }

  private decodeEscape(c: string): string {
    if (c === 'n') return '\n';
    if (c === 't') return '\t';
    if (c === 'r') return '\r';
    if (c === 'b') return '\b';
    if (c === 'f') return '\f';
    return c;
  }

  private parseSizedString(): LLSD {
    this.consume(); // 's'
    if (this.peek() === '(') {
      this.consume();
      const numStart = this.pos;
      while (this.pos < this.text.length && this.text[this.pos] !== ')') this.pos++;
      const sizeStr = this.text.substring(numStart, this.pos);
      const size = parseInt(sizeStr, 10) || 0;
      if (this.pos < this.text.length && this.text[this.pos] === ')') this.consume();
      if (this.pos < this.text.length && (this.text[this.pos] === '"' || this.text[this.pos] === '\'')) this.consume();
      const end = Math.min(this.pos + size, this.text.length);
      const str = this.text.substring(this.pos, end);
      this.pos = end;
      if (this.pos < this.text.length && (this.text[this.pos] === '"' || this.text[this.pos] === '\'')) this.consume();
      return new LLSD(str);
    }

    const nextChar = this.peek();
    if (nextChar === '"') return new LLSD(this.parseDoubleQuoted());
    if (nextChar === '\'') return new LLSD(this.parseSingleQuoted());
    return new LLSD('');
  }

  private parseBinaryNotation(): LLSD {
    this.consume(); // 'b'
    const c1 = this.peekAt(0);
    const c2 = this.peekAt(1);

    if (c1 === '6' && c2 === '4') {
      this.pos += 2;
      const dataStr = this.parseQuotedAfterTag();
      const bytes = new Uint8Array(Buffer.from(dataStr, 'base64'));
      return new LLSD(bytes);
    }
    if (c1 === '1' && c2 === '6') {
      this.pos += 2;
      const dataStr = this.parseQuotedAfterTag();
      const clean = dataStr.replace(/\s+/g, '');
      const bytes = new Uint8Array(Math.floor(clean.length / 2));
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
      }
      return new LLSD(bytes);
    }
    if (c1 === '(') {
      this.consume(); // '('
      const numStart = this.pos;
      while (this.pos < this.text.length && this.text[this.pos] !== ')') this.pos++;
      const size = parseInt(this.text.substring(numStart, this.pos), 10) || 0;
      if (this.pos < this.text.length && this.text[this.pos] === ')') this.consume();
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
      if (this.peek() === '}') break;

      let key = '';
      const c = this.peek();
      if (c === '\'') {
        key = this.parseSingleQuoted();
      } else if (c === '"') {
        key = this.parseDoubleQuoted();
      } else if (c === 's') {
        const sdKey = this.parseSizedString();
        key = sdKey.asString();
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
      if (this.peek() === ']') break;
      list.push(this.parseValue());
      this.skipWs();
      if (this.peek() === ',') this.consume();
      this.skipWs();
    }

    if (this.pos < this.text.length && this.peek() === ']') this.consume();
    return new LLSD(list);
  }
}
