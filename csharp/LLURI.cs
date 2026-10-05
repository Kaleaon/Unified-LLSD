using System;

namespace Unified.LLSD
{
    public struct LLURI : IEquatable<LLURI>
    {
        public string UriString;

        public LLURI(string uri)
        {
            UriString = uri ?? "";
        }

        public string Value => UriString;

        public override string ToString() => UriString;

        public bool Equals(LLURI other) => string.Equals(UriString, other.UriString, StringComparison.Ordinal);
        public override bool Equals(object? obj) => obj is LLURI other && Equals(other);
        public override int GetHashCode() => UriString != null ? UriString.GetHashCode() : 0;

        public static bool operator ==(LLURI a, LLURI b) => a.Equals(b);
        public static bool operator !=(LLURI a, LLURI b) => !a.Equals(b);
    }
}
