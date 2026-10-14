using System;

namespace Linkpoint.LLSD
{
    /// <summary>
    /// High-performance zero-allocation ASCII nibble lookup table hex decoder.
    /// </summary>
    public static class HexDecoder
    {
        private static readonly byte[] NibbleLookup = CreateLookupTable();

        private static byte[] CreateLookupTable()
        {
            byte[] table = new byte[256];
            for (int i = 0; i < 256; i++)
            {
                table[i] = 0xFF; // Invalid nibble marker
            }

            for (int i = 0; i <= 9; i++)
            {
                table['0' + i] = (byte)i;
            }

            for (int i = 0; i < 6; i++)
            {
                table['a' + i] = (byte)(10 + i);
                table['A' + i] = (byte)(10 + i);
            }

            return table;
        }

        /// <summary>
        /// Decodes a hex string span into a byte array without string allocations or BCL format parsing.
        /// Returns an empty byte array if the input is empty, has an odd length, or contains non-hex characters.
        /// </summary>
        public static byte[] Decode(ReadOnlySpan<char> hex)
        {
            if (hex.IsEmpty || hex.Length % 2 != 0)
            {
                return Array.Empty<byte>();
            }

            int byteCount = hex.Length / 2;
            byte[] bytes = new byte[byteCount];

            for (int i = 0; i < byteCount; i++)
            {
                char c1 = hex[i * 2];
                char c2 = hex[i * 2 + 1];

                if (c1 >= 256 || c2 >= 256)
                {
                    return Array.Empty<byte>();
                }

                byte nibble1 = NibbleLookup[c1];
                byte nibble2 = NibbleLookup[c2];

                if (nibble1 == 0xFF || nibble2 == 0xFF)
                {
                    return Array.Empty<byte>();
                }

                bytes[i] = (byte)((nibble1 << 4) | nibble2);
            }

            return bytes;
        }

        /// <summary>
        /// Decodes a hex string into a byte array without string allocations or BCL format parsing.
        /// Returns an empty byte array if the input is null, empty, has an odd length, or contains non-hex characters.
        /// </summary>
        public static byte[] Decode(string? hex)
        {
            if (string.IsNullOrEmpty(hex))
            {
                return Array.Empty<byte>();
            }

            return Decode(hex.AsSpan());
        }
    }
}
