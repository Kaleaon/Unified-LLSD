using System;
using System.Security.Cryptography;
using System.Text;

namespace Unified.LLSD
{
    public struct LLUUID : IEquatable<LLUUID>, IComparable<LLUUID>
    {
        public Guid GuidData;

        public static readonly LLUUID Zero = new LLUUID(Guid.Empty);

        public LLUUID(Guid guid)
        {
            GuidData = guid;
        }

        public LLUUID(string str)
        {
            if (Guid.TryParse(str, out var g))
                GuidData = g;
            else
                GuidData = Guid.Empty;
        }

        public LLUUID(byte[] bytes, int pos = 0)
        {
            if (bytes == null || bytes.Length - pos < 16)
            {
                GuidData = Guid.Empty;
                return;
            }
            byte[] buf = new byte[16];
            Array.Copy(bytes, pos, buf, 0, 16);
            // Convert network/big-endian byte order to Guid
            if (BitConverter.IsLittleEndian)
            {
                Array.Reverse(buf, 0, 4);
                Array.Reverse(buf, 4, 2);
                Array.Reverse(buf, 6, 2);
            }
            GuidData = new Guid(buf);
        }

        public bool IsNull => GuidData == Guid.Empty;
        public bool NotNull => !IsNull;

        public byte[] GetBytes()
        {
            byte[] buf = GuidData.ToByteArray();
            if (BitConverter.IsLittleEndian)
            {
                Array.Reverse(buf, 0, 4);
                Array.Reverse(buf, 4, 2);
                Array.Reverse(buf, 6, 2);
            }
            return buf;
        }

        public static LLUUID Random() => new LLUUID(Guid.NewGuid());

        public override string ToString() => GuidData.ToString("d");

        public bool Equals(LLUUID other) => GuidData.Equals(other.GuidData);
        public override bool Equals(object? obj) => obj is LLUUID other && Equals(other);
        public override int GetHashCode() => GuidData.GetHashCode();
        public int CompareTo(LLUUID other) => GuidData.CompareTo(other.GuidData);

        public static bool operator ==(LLUUID a, LLUUID b) => a.Equals(b);
        public static bool operator !=(LLUUID a, LLUUID b) => !a.Equals(b);
    }
}
