class LLDate {
  final double secondsSinceEpoch;

  static final LLDate nullDate = LLDate(0.0);

  LLDate(this.secondsSinceEpoch);

  factory LLDate.fromISOString(String s) {
    if (s.isEmpty) return nullDate;
    try {
      var clean = s.trim();
      if (clean.endsWith('Z') &&
          (clean.contains('+') || clean.indexOf('-', 10) != -1)) {
        clean = clean.substring(0, clean.length - 1);
      }
      final dt = DateTime.parse(clean).toUtc();
      return LLDate(dt.millisecondsSinceEpoch / 1000.0);
    } catch (_) {
      return nullDate;
    }
  }

  bool get isNull => secondsSinceEpoch == 0.0;
  bool get notNull => !isNull;

  String toISOString() {
    final dt = DateTime.fromMillisecondsSinceEpoch(
      (secondsSinceEpoch * 1000).round(),
      isUtc: true,
    );
    return dt.toIso8601String();
  }

  @override
  String toString() => toISOString();

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LLDate && secondsSinceEpoch == other.secondsSinceEpoch;

  @override
  int get hashCode => secondsSinceEpoch.hashCode;
}
