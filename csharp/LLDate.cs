using System;
using System.Globalization;

namespace Unified.LLSD
{
    public struct LLDate : IEquatable<LLDate>, IComparable<LLDate>
    {
        public double SecondsSinceEpoch;

        public static readonly LLDate Zero = new LLDate(0.0);

        public LLDate(double seconds)
        {
            SecondsSinceEpoch = seconds;
        }

        public LLDate(string isoStr)
        {
            if (string.IsNullOrWhiteSpace(isoStr))
            {
                SecondsSinceEpoch = 0.0;
                return;
            }
            if (DateTime.TryParse(isoStr, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal, out var dt))
            {
                DateTime epoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);
                SecondsSinceEpoch = (dt.ToUniversalTime() - epoch).TotalSeconds;
            }
            else
            {
                SecondsSinceEpoch = 0.0;
            }
        }

        public bool IsNull => SecondsSinceEpoch == 0.0;
        public bool NotNull => !IsNull;

        public string ToISOString()
        {
            DateTime epoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            DateTime dt = epoch.AddSeconds(SecondsSinceEpoch);
            return dt.ToString("yyyy-MM-ddTHH:mm:ss.ffZ", CultureInfo.InvariantCulture);
        }

        public override string ToString() => ToISOString();

        public bool Equals(LLDate other) => SecondsSinceEpoch.Equals(other.SecondsSinceEpoch);
        public override bool Equals(object? obj) => obj is LLDate other && Equals(other);
        public override int GetHashCode() => SecondsSinceEpoch.GetHashCode();
        public int CompareTo(LLDate other) => SecondsSinceEpoch.CompareTo(other.SecondsSinceEpoch);

        public static bool operator ==(LLDate a, LLDate b) => a.Equals(b);
        public static bool operator !=(LLDate a, LLDate b) => !a.Equals(b);
    }
}
