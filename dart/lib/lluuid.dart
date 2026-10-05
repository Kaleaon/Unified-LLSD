import 'dart:typed_data';

class LLUUID {
  final Uint8List bytes;

  static final LLUUID nullUuid = LLUUID(Uint8List(16));

  LLUUID(this.bytes) {
    if (bytes.length != 16) {
      throw ArgumentError('UUID must be exactly 16 bytes');
    }
  }

  factory LLUUID.fromString(String s) {
    final clean = s.replaceAll('-', '').replaceAll('{', '').replaceAll('}', '');
    if (clean.length != 32) return nullUuid;
    final b = Uint8List(16);
    for (var i = 0; i < 16; i++) {
      b[i] = int.parse(clean.substring(i * 2, i * 2 + 2), radix: 16);
    }
    return LLUUID(b);
  }

  bool get isNull => bytes.every((b) => b == 0);
  bool get notNull => !isNull;

  @override
  String toString() {
    final sb = StringBuffer();
    for (var i = 0; i < 16; i++) {
      if (i == 4 || i == 6 || i == 8 || i == 10) sb.write('-');
      sb.write(bytes[i].toRadixString(16).padLeft(2, '0'));
    }
    return sb.toString();
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LLUUID &&
          bytes.length == other.bytes.length &&
          Iterable.generate(16).every((i) => bytes[i] == other.bytes[i]);

  @override
  int get hashCode => Object.hashAll(bytes);
}
