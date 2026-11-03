import { LLSD, LLSDType } from './llsd.js';
import { LLUUID } from './lluuid.js';
import { LLDate } from './lldate.js';
import { LLURI } from './lluri.js';

export class BinaryCodec {
  public static readonly binaryHeader = "<? llsd/binary ?>\n";

  public static encode(sd: LLSD): Uint8Array {
    return this.toBinary(sd);
  }

  public static toBinary(sd: LLSD): Uint8Array {
    const chunks: Uint8Array[] = [];
    this.writeElement(chunks, sd);
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

  private static writeElement(chunks: Uint8Array[], sd: LLSD): void {
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
        const strBytes = Buffer.from(sd.asString(), 'utf-8');
        const buf = new Uint8Array(5 + strBytes.length);
        buf[0] = 115; // 's'
        const dv = new DataView(buf.buffer, 1, 4);
        dv.setUint32(0, strBytes.length, false); // Big endian
        buf.set(strBytes, 5);
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
        dv.setFloat64(0, sd.asDate().secondsSinceEpoch, true); // Date is LE!
        chunks.push(buf);
        break;
      }
      case LLSDType.URI: {
        const uriBytes = Buffer.from(sd.asURI().asString(), 'utf-8');
        const buf = new Uint8Array(5 + uriBytes.length);
        buf[0] = 108; // 'l'
        const dv = new DataView(buf.buffer, 1, 4);
        dv.setUint32(0, uriBytes.length, false); // Big endian
        buf.set(uriBytes, 5);
        chunks.push(buf);
        break;
      }
      case LLSDType.Binary: {
        const bin = sd.asBinary();
        const buf = new Uint8Array(5 + bin.length);
        buf[0] = 98; // 'b'
        const dv = new DataView(buf.buffer, 1, 4);
        dv.setUint32(0, bin.length, false); // Big endian
        buf.set(bin, 5);
        chunks.push(buf);
        break;
      }
      case LLSDType.Map: {
        const map = sd.asMap();
        const header = new Uint8Array(5);
        header[0] = 123; // '{'
        const dv = new DataView(header.buffer, 1, 4);
        dv.setUint32(0, map.size, false);
        chunks.push(header);

        for (const [key, val] of map.entries()) {
          const kBytes = Buffer.from(key, 'utf-8');
          const kHeader = new Uint8Array(5 + kBytes.length);
          kHeader[0] = 107; // 'k'
          const kDv = new DataView(kHeader.buffer, 1, 4);
          kDv.setUint32(0, kBytes.length, false);
          kHeader.set(kBytes, 5);
          chunks.push(kHeader);

          this.writeElement(chunks, val);
        }

        chunks.push(new Uint8Array([125])); // '}'
        break;
      }
      case LLSDType.Array: {
        const arr = sd.asArray();
        const header = new Uint8Array(5);
        header[0] = 91; // '['
        const dv = new DataView(header.buffer, 1, 4);
        dv.setUint32(0, arr.length, false);
        chunks.push(header);

        for (const item of arr) {
          this.writeElement(chunks, item);
        }

        chunks.push(new Uint8Array([93])); // ']'
        break;
      }
      default:
        chunks.push(new Uint8Array([33]));
        break;
    }
  }

  public static decode(data: Uint8Array): LLSD {
    return this.fromBinary(data);
  }

  public static fromBinary(data: Uint8Array): LLSD {
    if (!data || data.length === 0) return LLSD.undefined;
    const reader = new BinaryReader(data);
    return reader.parse();
  }
}

class BinaryReader {
  private pos = 0;
  private dv: DataView;

  constructor(private data: Uint8Array) {
    let offset = 0;
    if (data.length >= 2 && data[0] === 60 && data[1] === 63) { // '<?'
      for (let i = 0; i < data.length; i++) {
        if (data[i] === 10) { // '\n'
          offset = i + 1;
          break;
        }
      }
    }
    this.pos = offset;
    this.dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  public parse(): LLSD {
    if (this.pos >= this.data.length) return LLSD.undefined;

    const tag = this.data[this.pos++];
    switch (tag) {
      case 33: // '!'
        return LLSD.undefined;
      case 49: // '1'
      case 116: // 't'
        return new LLSD(true);
      case 48: // '0'
      case 102: // 'f'
        return new LLSD(false);
      case 105: { // 'i'
        if (this.pos + 4 > this.data.length) return LLSD.undefined;
        const val = this.dv.getInt32(this.pos, false);
        this.pos += 4;
        return new LLSD(BigInt(val));
      }
      case 114: { // 'r'
        if (this.pos + 8 > this.data.length) return LLSD.undefined;
        const val = this.dv.getFloat64(this.pos, false);
        this.pos += 8;
        return new LLSD(val);
      }
      case 100: { // 'd'
        if (this.pos + 8 > this.data.length) return LLSD.undefined;
        const secs = this.dv.getFloat64(this.pos, true); // LE double
        this.pos += 8;
        return new LLSD(new LLDate(secs));
      }
      case 115: { // 's'
        if (this.pos + 4 > this.data.length) return LLSD.undefined;
        const len = this.dv.getUint32(this.pos, false);
        this.pos += 4;
        if (this.pos + len > this.data.length) return LLSD.undefined;
        const bytes = this.data.subarray(this.pos, this.pos + len);
        this.pos += len;
        return new LLSD(Buffer.from(bytes).toString('utf-8'));
      }
      case 117: { // 'u'
        if (this.pos + 16 > this.data.length) return LLSD.undefined;
        const bytes = this.data.subarray(this.pos, this.pos + 16);
        this.pos += 16;
        return new LLSD(new LLUUID(bytes));
      }
      case 108: { // 'l'
        if (this.pos + 4 > this.data.length) return LLSD.undefined;
        const len = this.dv.getUint32(this.pos, false);
        this.pos += 4;
        if (this.pos + len > this.data.length) return LLSD.undefined;
        const bytes = this.data.subarray(this.pos, this.pos + len);
        this.pos += len;
        return new LLSD(new LLURI(Buffer.from(bytes).toString('utf-8')));
      }
      case 98: { // 'b'
        if (this.pos + 4 > this.data.length) return LLSD.undefined;
        const len = this.dv.getUint32(this.pos, false);
        this.pos += 4;
        if (this.pos + len > this.data.length) return LLSD.undefined;
        const bytes = this.data.slice(this.pos, this.pos + len);
        this.pos += len;
        return new LLSD(bytes);
      }
      case 123: { // '{'
        if (this.pos + 4 > this.data.length) return LLSD.undefined;
        const count = this.dv.getUint32(this.pos, false);
        this.pos += 4;
        const map = new Map<string, LLSD>();
        for (let i = 0; i < count; i++) {
          if (this.pos >= this.data.length) break;
          const kTag = this.data[this.pos++];
          if (kTag !== 107 && kTag !== 115) { // 'k' or 's'
            break;
          }
          if (this.pos + 4 > this.data.length) break;
          const kLen = this.dv.getUint32(this.pos, false);
          this.pos += 4;
          if (this.pos + kLen > this.data.length) break;
          const kBytes = this.data.subarray(this.pos, this.pos + kLen);
          this.pos += kLen;
          const key = Buffer.from(kBytes).toString('utf-8');
          const val = this.parse();
          map.set(key, val);
        }
        if (this.pos < this.data.length && this.data[this.pos] === 125) { // '}'
          this.pos++;
        }
        return new LLSD(map);
      }
      case 91: { // '['
        if (this.pos + 4 > this.data.length) return LLSD.undefined;
        const count = this.dv.getUint32(this.pos, false);
        this.pos += 4;
        const list: LLSD[] = [];
        for (let i = 0; i < count; i++) {
          list.push(this.parse());
        }
        if (this.pos < this.data.length && this.data[this.pos] === 93) { // ']'
          this.pos++;
        }
        return new LLSD(list);
      }
      default:
        return LLSD.undefined;
    }
  }
}
