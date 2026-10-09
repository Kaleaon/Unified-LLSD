import { LLSD } from './llsd.js';
import { XmlCodec } from './xml_codec.js';
import { BinaryCodec } from './binary_codec.js';
import { NotationCodec } from './notation_codec.js';

export class LLSDSerialize {
  public static readonly binaryHeader = BinaryCodec.binaryHeader;
  public static readonly notationHeader = NotationCodec.notationHeader;
  public static readonly xmlHeader = XmlCodec.xmlHeader;

  // --- XML ---
  public static toXML(sd: LLSD, withDeclaration = false): string {
    return XmlCodec.toXML(sd, withDeclaration);
  }

  public static fromXML(xml: string): LLSD {
    return XmlCodec.fromXML(xml);
  }

  // --- Binary ---
  public static toBinary(sd: LLSD): Uint8Array {
    return BinaryCodec.toBinary(sd);
  }

  public static fromBinary(bytes: Uint8Array): LLSD {
    return BinaryCodec.fromBinary(bytes);
  }

  // --- Notation ---
  public static toNotation(sd: LLSD): string {
    return NotationCodec.toNotation(sd);
  }

  public static fromNotation(text: string): LLSD {
    return NotationCodec.fromNotation(text);
  }

  // --- Auto-detect Parse ---
  public static parse(data: Uint8Array | string): LLSD {
    if (data instanceof Uint8Array) {
      if (data.length >= 2 && data[0] === 60 && data[1] === 63) { // '<?'
        const headerStr = Buffer.from(data.subarray(0, Math.min(64, data.length))).toString('ascii');
        if (headerStr.includes('llsd/binary')) {
          return BinaryCodec.fromBinary(data);
        }
        if (headerStr.includes('llsd/notation')) {
          return NotationCodec.fromNotation(Buffer.from(data).toString('utf-8'));
        }
        if (headerStr.includes('xml') || headerStr.includes('llsd')) {
          return XmlCodec.fromXML(Buffer.from(data).toString('utf-8'));
        }
      }
      return BinaryCodec.fromBinary(data);
    } else if (typeof data === 'string') {
      const trimmed = data.trimStart();
      if (trimmed.startsWith('<')) {
        return XmlCodec.fromXML(data);
      }
      return NotationCodec.fromNotation(data);
    }
    return LLSD.undefined;
  }
}
