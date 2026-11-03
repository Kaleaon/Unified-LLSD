import 'dart:typed_data';

class PacketFlags {
  static const int none = 0x00;
  static const int acks = 0x10;
  static const int resent = 0x20;
  static const int reliable = 0x40;
  static const int zeroCoded = 0x80;
}

class PacketHeader {
  int flags;
  int sequenceNumber;
  int extraBytes;
  int messageId;
  List<int> acks;

  PacketHeader({
    this.flags = 0,
    this.sequenceNumber = 0,
    this.extraBytes = 0,
    this.messageId = 0,
    List<int>? acks,
  }) : acks = acks ?? [];

  bool get isReliable => (flags & PacketFlags.reliable) != 0;
  bool get isZeroCoded => (flags & PacketFlags.zeroCoded) != 0;
  bool get isResent => (flags & PacketFlags.resent) != 0;
  bool get hasAcks => (flags & PacketFlags.acks) != 0;
}

class PacketCodec {
  static (PacketHeader, int) decodeHeader(Uint8List buffer) {
    if (buffer.length < 6) {
      throw FormatException('Buffer too small for packet header.');
    }

    final flags = buffer[0];
    final bd = ByteData.sublistView(buffer);
    final seq = bd.getUint32(1, Endian.big);
    final extra = buffer[5];

    final header = PacketHeader(
      flags: flags,
      sequenceNumber: seq,
      extraBytes: extra,
    );

    var offset = 6 + extra;

    if (offset < buffer.length) {
      final first = buffer[offset];
      if (first != 0xFF) {
        header.messageId = first;
        offset += 1;
      } else if (offset + 1 < buffer.length && buffer[offset + 1] != 0xFF) {
        final second = buffer[offset + 1];
        header.messageId = (0xFF00) | second;
        offset += 2;
      } else if (offset + 3 < buffer.length) {
        header.messageId = bd.getUint32(offset, Endian.big);
        offset += 4;
      }
    }

    if (header.hasAcks && buffer.isNotEmpty) {
      final ackCount = buffer.last;
      final ackStart = buffer.length - 1 - (ackCount * 4);
      if (ackStart >= offset) {
        for (var i = 0; i < ackCount; i++) {
          final pos = ackStart + (i * 4);
          final ackSeq = bd.getUint32(pos, Endian.big);
          header.acks.add(ackSeq);
        }
      }
    }

    return (header, offset);
  }

  static Uint8List zeroDecode(Uint8List src, int headerLen) {
    if (src.length <= headerLen) return Uint8List.fromList(src);

    final dst = <int>[];
    dst.addAll(src.sublist(0, headerLen));

    var pos = headerLen;
    while (pos < src.length) {
      final b = src[pos++];
      if (b == 0x00) {
        if (pos < src.length) {
          final zeroCount = src[pos++];
          dst.addAll(List.filled(zeroCount, 0x00));
        } else {
          dst.add(0x00);
        }
      } else {
        dst.add(b);
      }
    }

    return Uint8List.fromList(dst);
  }

  static Uint8List zeroEncode(Uint8List body) {
    final dst = <int>[];
    var i = 0;
    while (i < body.length) {
      if (body[i] == 0x00) {
        final zeroStart = i;
        while (i < body.length && body[i] == 0x00 && (i - zeroStart) < 255) {
          i++;
        }
        final count = i - zeroStart;
        dst.add(0x00);
        dst.add(count);
      } else {
        dst.add(body[i++]);
      }
    }
    return Uint8List.fromList(dst);
  }
}
