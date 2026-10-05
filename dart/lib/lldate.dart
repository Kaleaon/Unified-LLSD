class LLDate {
  final double secondsSinceEpoch;

  static final LLDate nullDate = LLDate(0.0);

  LLDate(this.secondsSinceEpoch);

  factory LLDate.fromISOString(String s) {
    if (s.isEmpty) return nullDate;
    try {
      final dt = DateTime.parse(s).toUtc();
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
