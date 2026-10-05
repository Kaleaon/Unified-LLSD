class LLURI {
  final String uri;

  LLURI(this.uri);

  String asString() => uri;

  @override
  String toString() => uri;

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is LLURI && uri == other.uri;

  @override
  int get hashCode => uri.hashCode;
}
