export enum PacketFlags {
  None = 0x00,
  Acks = 0x10,
  Resent = 0x20,
  Reliable = 0x40,
  ZeroCoded = 0x80,
}

export class PacketHeader {
  flags: number;
  sequenceNumber: number;
  extraBytes: number;
  messageId: number;
  acks: number[];

  constructor(
    flags = 0,
    sequenceNumber = 0,
    extraBytes = 0,
    messageId = 0,
    acks: number[] = []
  ) {
    this.flags = flags;
    this.sequenceNumber = sequenceNumber;
    this.extraBytes = extraBytes;
    this.messageId = messageId;
    this.acks = acks;
  }

  get isReliable(): boolean {
    return (this.flags & PacketFlags.Reliable) !== 0;
  }

  get isZeroCoded(): boolean {
    return (this.flags & PacketFlags.ZeroCoded) !== 0;
  }

  get isResent(): boolean {
    return (this.flags & PacketFlags.Resent) !== 0;
  }

  get hasAcks(): boolean {
    return (this.flags & PacketFlags.Acks) !== 0;
  }
}

export class PacketCodec {
  static decodeHeader(buffer: Uint8Array): { header: PacketHeader; headerLength: number } {
    if (buffer.length < 6) {
      throw new Error("Buffer too small for packet header.");
    }

    const flags = buffer[0];
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const seq = view.getUint32(1, false);
    const extra = buffer[5];

    const header = new PacketHeader(flags, seq, extra);
    let offset = 6 + extra;

    if (offset < buffer.length) {
      const first = buffer[offset];
      if (first !== 0xff) {
        header.messageId = first;
        offset += 1;
      } else if (offset + 1 < buffer.length && buffer[offset + 1] !== 0xff) {
        const second = buffer[offset + 1];
        header.messageId = (0xff00) | second;
        offset += 2;
      } else if (offset + 3 < buffer.length) {
        header.messageId = view.getUint32(offset, false);
        offset += 4;
      }
    }

    if (header.hasAcks && buffer.length > 0) {
      const ackCount = buffer[buffer.length - 1];
      const ackStart = buffer.length - 1 - (ackCount * 4);
      if (ackStart >= offset) {
        for (let i = 0; i < ackCount; i++) {
          const pos = ackStart + (i * 4);
          const ackSeq = view.getUint32(pos, false);
          header.acks.push(ackSeq);
        }
      }
    }

    return { header, headerLength: offset };
  }

  static zeroDecode(src: Uint8Array, headerLen: number): Uint8Array {
    if (src.length <= headerLen) {
      return new Uint8Array(src);
    }

    const dst: number[] = [];
    for (let i = 0; i < headerLen; i++) {
      dst.push(src[i]);
    }

    let pos = headerLen;
    while (pos < src.length) {
      const b = src[pos++];
      if (b === 0x00) {
        if (pos < src.length) {
          const zeroCount = src[pos++];
          for (let z = 0; z < zeroCount; z++) {
            dst.push(0x00);
          }
        } else {
          dst.push(0x00);
        }
      } else {
        dst.push(b);
      }
    }

    return new Uint8Array(dst);
  }

  static zeroEncode(body: Uint8Array): Uint8Array {
    const dst: number[] = [];
    let i = 0;
    while (i < body.length) {
      if (body[i] === 0x00) {
        const zeroStart = i;
        while (i < body.length && body[i] === 0x00 && (i - zeroStart) < 255) {
          i++;
        }
        const count = i - zeroStart;
        dst.push(0x00);
        dst.push(count);
      } else {
        dst.push(body[i++]);
      }
    }
    return new Uint8Array(dst);
  }
}
