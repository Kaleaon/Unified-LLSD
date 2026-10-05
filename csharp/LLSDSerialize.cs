using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Xml;

namespace Unified.LLSD
{
    public static class LLSDSerialize
    {
        public const string BinaryHeader = "<? llsd/binary ?>\n";
        public const string NotationHeader = "<? llsd/notation ?>\n";
        public const string XmlHeader = "<?xml version=\"1.0\" ?>\n";

        // --- XML ---
        public static string ToXML(LLSD sd, bool withDeclaration = false)
        {
            StringBuilder sb = new StringBuilder();
            if (withDeclaration) sb.Append(XmlHeader);
            sb.Append("<llsd>");
            WriteXMLElement(sb, sd);
            sb.Append("</llsd>");
            return sb.ToString();
        }

        private static void WriteXMLElement(StringBuilder sb, LLSD sd)
        {
            switch (sd.Type)
            {
                case LLSDType.Undefined:
                    sb.Append("<undef/>");
                    break;
                case LLSDType.Boolean:
                    sb.Append("<boolean>").Append(sd.AsBoolean() ? "true" : "false").Append("</boolean>");
                    break;
                case LLSDType.Integer:
                    sb.Append("<integer>").Append(sd.AsLong()).Append("</integer>");
                    break;
                case LLSDType.Real:
                    double r = sd.AsReal();
                    if (double.IsNaN(r)) sb.Append("<real>nan</real>");
                    else if (double.IsPositiveInfinity(r)) sb.Append("<real>inf</real>");
                    else if (double.IsNegativeInfinity(r)) sb.Append("<real>-inf</real>");
                    else sb.Append("<real>").Append(r.ToString(System.Globalization.CultureInfo.InvariantCulture)).Append("</real>");
                    break;
                case LLSDType.String:
                    string s = sd.AsString();
                    if (string.IsNullOrEmpty(s)) sb.Append("<string/>");
                    else sb.Append("<string>").Append(XmlEscape(s)).Append("</string>");
                    break;
                case LLSDType.UUID:
                    LLUUID u = sd.AsUUID();
                    if (u.IsNull) sb.Append("<uuid/>");
                    else sb.Append("<uuid>").Append(u.ToString()).Append("</uuid>");
                    break;
                case LLSDType.Date:
                    sb.Append("<date>").Append(sd.AsDate().ToISOString()).Append("</date>");
                    break;
                case LLSDType.URI:
                    sb.Append("<uri>").Append(XmlEscape(sd.AsURI().Value)).Append("</uri>");
                    break;
                case LLSDType.Binary:
                    sb.Append("<binary encoding=\"base64\">").Append(Convert.ToBase64String(sd.AsBinary())).Append("</binary>");
                    break;
                case LLSDType.Map:
                    sb.Append("<map>");
                    foreach (var pair in sd)
                    {
                        sb.Append("<key>").Append(XmlEscape(pair.Key)).Append("</key>");
                        WriteXMLElement(sb, pair.Value);
                    }
                    sb.Append("</map>");
                    break;
                case LLSDType.Array:
                    sb.Append("<array>");
                    for (int i = 0; i < sd.Count; i++)
                    {
                        WriteXMLElement(sb, sd[i]);
                    }
                    sb.Append("</array>");
                    break;
            }
        }

        private static string XmlEscape(string text)
        {
            return text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");
        }

        public static LLSD FromXML(string xml)
        {
            if (string.IsNullOrWhiteSpace(xml)) return LLSD.Undefined;
            XmlDocument doc = new XmlDocument();
            doc.LoadXml(xml);
            XmlElement? root = doc.DocumentElement;
            if (root == null) return LLSD.Undefined;
            if (root.Name == "llsd")
            {
                foreach (XmlNode child in root.ChildNodes)
                {
                    if (child is XmlElement el) return ParseXmlElement(el);
                }
            }
            return ParseXmlElement(root);
        }

        private static LLSD ParseXmlElement(XmlElement el)
        {
            switch (el.Name)
            {
                case "undef": return LLSD.Undefined;
                case "boolean":
                    string bStr = el.InnerText.Trim().ToLowerInvariant();
                    return new LLSD(bStr == "true" || bStr == "1" || bStr == "t");
                case "integer":
                    return long.TryParse(el.InnerText.Trim(), out var l) ? new LLSD(l) : new LLSD(0L);
                case "real":
                    string rStr = el.InnerText.Trim().ToLowerInvariant();
                    if (rStr == "nan") return new LLSD(double.NaN);
                    if (rStr == "inf" || rStr == "+inf") return new LLSD(double.PositiveInfinity);
                    if (rStr == "-inf") return new LLSD(double.NegativeInfinity);
                    return double.TryParse(rStr, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var d) ? new LLSD(d) : new LLSD(0.0);
                case "string": return new LLSD(el.InnerText);
                case "uuid": return new LLSD(new LLUUID(el.InnerText.Trim()));
                case "date": return new LLSD(new LLDate(el.InnerText.Trim()));
                case "uri": return new LLSD(new LLURI(el.InnerText.Trim()));
                case "binary":
                    string enc = el.GetAttribute("encoding").ToLowerInvariant();
                    if (enc == "base16") return new LLSD(HexDecode(el.InnerText.Trim()));
                    return new LLSD(Convert.FromBase64String(el.InnerText.Trim()));
                case "map":
                    var map = new Dictionary<string, LLSD>();
                    XmlNodeList children = el.ChildNodes;
                    for (int i = 0; i < children.Count; i++)
                    {
                        if (children[i] is XmlElement kEl && kEl.Name == "key")
                        {
                            string key = kEl.InnerText;
                            i++;
                            while (i < children.Count && !(children[i] is XmlElement)) i++;
                            if (i < children.Count && children[i] is XmlElement vEl)
                            {
                                map[key] = ParseXmlElement(vEl);
                            }
                        }
                    }
                    return new LLSD(map);
                case "array":
                    var list = new List<LLSD>();
                    foreach (XmlNode child in el.ChildNodes)
                    {
                        if (child is XmlElement cEl) list.Add(ParseXmlElement(cEl));
                    }
                    return new LLSD(list);
                default: return LLSD.Undefined;
            }
        }

        private static byte[] HexDecode(string hex)
        {
            if (hex.Length % 2 != 0) return Array.Empty<byte>();
            byte[] bytes = new byte[hex.Length / 2];
            for (int i = 0; i < bytes.Length; i++)
            {
                bytes[i] = Convert.ToByte(hex.Substring(i * 2, 2), 16);
            }
            return bytes;
        }

        // --- Binary ---
        public static byte[] ToBinary(LLSD sd)
        {
            using MemoryStream ms = new MemoryStream();
            using BinaryWriter bw = new BinaryWriter(ms);
            WriteBinary(bw, sd);
            return ms.ToArray();
        }

        private static void WriteBinary(BinaryWriter bw, LLSD sd)
        {
            switch (sd.Type)
            {
                case LLSDType.Undefined:
                    bw.Write((byte)'!');
                    break;
                case LLSDType.Boolean:
                    bw.Write((byte)(sd.AsBoolean() ? '1' : '0'));
                    break;
                case LLSDType.Integer:
                    bw.Write((byte)'i');
                    WriteInt32BE(bw, sd.AsInteger());
                    break;
                case LLSDType.Real:
                    bw.Write((byte)'r');
                    WriteDoubleBE(bw, sd.AsReal());
                    break;
                case LLSDType.String:
                    bw.Write((byte)'s');
                    byte[] sBytes = Encoding.UTF8.GetBytes(sd.AsString());
                    WriteInt32BE(bw, sBytes.Length);
                    bw.Write(sBytes);
                    break;
                case LLSDType.UUID:
                    bw.Write((byte)'u');
                    bw.Write(sd.AsUUID().GetBytes());
                    break;
                case LLSDType.Date:
                    bw.Write((byte)'d');
                    WriteDoubleLE(bw, sd.AsDate().SecondsSinceEpoch); // Date is LE!
                    break;
                case LLSDType.URI:
                    bw.Write((byte)'l');
                    byte[] uBytes = Encoding.UTF8.GetBytes(sd.AsURI().Value);
                    WriteInt32BE(bw, uBytes.Length);
                    bw.Write(uBytes);
                    break;
                case LLSDType.Binary:
                    bw.Write((byte)'b');
                    byte[] bBytes = sd.AsBinary();
                    WriteInt32BE(bw, bBytes.Length);
                    bw.Write(bBytes);
                    break;
                case LLSDType.Map:
                    bw.Write((byte)'{');
                    WriteInt32BE(bw, sd.Count);
                    foreach (var pair in sd)
                    {
                        bw.Write((byte)'k');
                        byte[] kBytes = Encoding.UTF8.GetBytes(pair.Key);
                        WriteInt32BE(bw, kBytes.Length);
                        bw.Write(kBytes);
                        WriteBinary(bw, pair.Value);
                    }
                    bw.Write((byte)'}');
                    break;
                case LLSDType.Array:
                    bw.Write((byte)'[');
                    WriteInt32BE(bw, sd.Count);
                    for (int i = 0; i < sd.Count; i++)
                    {
                        WriteBinary(bw, sd[i]);
                    }
                    bw.Write((byte)']');
                    break;
            }
        }

        public static LLSD FromBinary(byte[] bytes)
        {
            if (bytes == null || bytes.Length == 0) return LLSD.Undefined;
            int start = 0;
            if (bytes.Length >= 2 && bytes[0] == '<' && bytes[1] == '?')
            {
                int nl = Array.IndexOf(bytes, (byte)'\n');
                if (nl > 0) start = nl + 1;
            }
            using MemoryStream ms = new MemoryStream(bytes, start, bytes.Length - start);
            using BinaryReader br = new BinaryReader(ms);
            return ReadBinary(br);
        }

        private static LLSD ReadBinary(BinaryReader br)
        {
            byte tag = br.ReadByte();
            switch ((char)tag)
            {
                case '!': return LLSD.Undefined;
                case '1': return new LLSD(true);
                case '0': return new LLSD(false);
                case 'i': return new LLSD(ReadInt32BE(br));
                case 'r': return new LLSD(ReadDoubleBE(br));
                case 's':
                    int sLen = ReadInt32BE(br);
                    return new LLSD(Encoding.UTF8.GetString(br.ReadBytes(sLen)));
                case 'u':
                    return new LLSD(new LLUUID(br.ReadBytes(16)));
                case 'd':
                    return new LLSD(new LLDate(ReadDoubleLE(br)));
                case 'l':
                    int lLen = ReadInt32BE(br);
                    return new LLSD(new LLURI(Encoding.UTF8.GetString(br.ReadBytes(lLen))));
                case 'b':
                    int bLen = ReadInt32BE(br);
                    return new LLSD(br.ReadBytes(bLen));
                case '{':
                    int mCount = ReadInt32BE(br);
                    var map = new Dictionary<string, LLSD>();
                    for (int i = 0; i < mCount; i++)
                    {
                        byte kTag = br.ReadByte();
                        int kLen = ReadInt32BE(br);
                        string key = Encoding.UTF8.GetString(br.ReadBytes(kLen));
                        map[key] = ReadBinary(br);
                    }
                    if (br.BaseStream.Position < br.BaseStream.Length) br.ReadByte(); // '}'
                    return new LLSD(map);
                case '[':
                    int aCount = ReadInt32BE(br);
                    var list = new List<LLSD>();
                    for (int i = 0; i < aCount; i++)
                    {
                        list.Add(ReadBinary(br));
                    }
                    if (br.BaseStream.Position < br.BaseStream.Length) br.ReadByte(); // ']'
                    return new LLSD(list);
                default: return LLSD.Undefined;
            }
        }

        private static void WriteInt32BE(BinaryWriter bw, int val)
        {
            byte[] b = BitConverter.GetBytes(val);
            if (BitConverter.IsLittleEndian) Array.Reverse(b);
            bw.Write(b);
        }

        private static int ReadInt32BE(BinaryReader br)
        {
            byte[] b = br.ReadBytes(4);
            if (BitConverter.IsLittleEndian) Array.Reverse(b);
            return BitConverter.ToInt32(b, 0);
        }

        private static void WriteDoubleBE(BinaryWriter bw, double val)
        {
            byte[] b = BitConverter.GetBytes(val);
            if (BitConverter.IsLittleEndian) Array.Reverse(b);
            bw.Write(b);
        }

        private static double ReadDoubleBE(BinaryReader br)
        {
            byte[] b = br.ReadBytes(8);
            if (BitConverter.IsLittleEndian) Array.Reverse(b);
            return BitConverter.ToDouble(b, 0);
        }

        private static void WriteDoubleLE(BinaryWriter bw, double val)
        {
            byte[] b = BitConverter.GetBytes(val);
            if (!BitConverter.IsLittleEndian) Array.Reverse(b);
            bw.Write(b);
        }

        private static double ReadDoubleLE(BinaryReader br)
        {
            byte[] b = br.ReadBytes(8);
            if (!BitConverter.IsLittleEndian) Array.Reverse(b);
            return BitConverter.ToDouble(b, 0);
        }

        // --- Notation ---
        public static string ToNotation(LLSD sd)
        {
            StringBuilder sb = new StringBuilder();
            WriteNotation(sb, sd);
            return sb.ToString();
        }

        private static void WriteNotation(StringBuilder sb, LLSD sd)
        {
            switch (sd.Type)
            {
                case LLSDType.Undefined: sb.Append('!'); break;
                case LLSDType.Boolean: sb.Append(sd.AsBoolean() ? "true" : "false"); break;
                case LLSDType.Integer: sb.Append('i').Append(sd.AsLong()); break;
                case LLSDType.Real:
                    double r = sd.AsReal();
                    if (double.IsNaN(r)) sb.Append("rnan");
                    else if (double.IsPositiveInfinity(r)) sb.Append("rinf");
                    else if (double.IsNegativeInfinity(r)) sb.Append("r-inf");
                    else sb.Append('r').Append(r.ToString(System.Globalization.CultureInfo.InvariantCulture));
                    break;
                case LLSDType.String:
                    sb.Append('\'').Append(sd.AsString().Replace("\\", "\\\\").Replace("'", "\\'")).Append('\'');
                    break;
                case LLSDType.UUID: sb.Append('u').Append(sd.AsUUID().ToString()); break;
                case LLSDType.Date: sb.Append("d\"").Append(sd.AsDate().ToISOString()).Append('"'); break;
                case LLSDType.URI: sb.Append("l\"").Append(sd.AsURI().Value).Append('"'); break;
                case LLSDType.Binary:
                    sb.Append("b64\"").Append(Convert.ToBase64String(sd.AsBinary())).Append('"');
                    break;
                case LLSDType.Map:
                    sb.Append('{');
                    bool first = true;
                    foreach (var pair in sd)
                    {
                        if (!first) sb.Append(',');
                        first = false;
                        sb.Append('\'').Append(pair.Key.Replace("\\", "\\\\").Replace("'", "\\'")).Append("':");
                        WriteNotation(sb, pair.Value);
                    }
                    sb.Append('}');
                    break;
                case LLSDType.Array:
                    sb.Append('[');
                    for (int i = 0; i < sd.Count; i++)
                    {
                        if (i > 0) sb.Append(',');
                        WriteNotation(sb, sd[i]);
                    }
                    sb.Append(']');
                    break;
            }
        }

        public static LLSD FromNotation(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return LLSD.Undefined;
            int pos = 0;
            if (text.StartsWith(NotationHeader)) pos = NotationHeader.Length;
            return ParseNotation(text, ref pos);
        }

        private static LLSD ParseNotation(string text, ref int pos)
        {
            SkipWs(text, ref pos);
            if (pos >= text.Length) return LLSD.Undefined;

            char c = text[pos];
            if (c == '!') { pos++; return LLSD.Undefined; }
            if (c == '1' || c == 't' || c == 'T')
            {
                if (pos + 4 <= text.Length && text.Substring(pos, 4).Equals("true", StringComparison.OrdinalIgnoreCase)) pos += 4;
                else pos++;
                return new LLSD(true);
            }
            if (c == '0' || c == 'f' || c == 'F')
            {
                if (pos + 5 <= text.Length && text.Substring(pos, 5).Equals("false", StringComparison.OrdinalIgnoreCase)) pos += 5;
                else pos++;
                return new LLSD(false);
            }
            if (c == 'i')
            {
                pos++;
                int start = pos;
                while (pos < text.Length && (char.IsDigit(text[pos]) || text[pos] == '-')) pos++;
                return long.TryParse(text.Substring(start, pos - start), out var l) ? new LLSD(l) : new LLSD(0L);
            }
            if (c == 'r')
            {
                pos++;
                int start = pos;
                while (pos < text.Length && (char.IsDigit(text[pos]) || text[pos] == '.' || text[pos] == '-' || text[pos] == '+' || char.IsLetter(text[pos]))) pos++;
                string num = text.Substring(start, pos - start);
                if (num == "nan") return new LLSD(double.NaN);
                if (num == "inf" || num == "+inf") return new LLSD(double.PositiveInfinity);
                if (num == "-inf") return new LLSD(double.NegativeInfinity);
                return double.TryParse(num, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var d) ? new LLSD(d) : new LLSD(0.0);
            }
            if (c == '\'' || c == '"') return new LLSD(ParseQuoted(text, ref pos));
            if (c == 'u')
            {
                pos++;
                string uStr = text.Substring(pos, Math.Min(36, text.Length - pos));
                pos += uStr.Length;
                return new LLSD(new LLUUID(uStr));
            }
            if (c == 'd') { pos++; return new LLSD(new LLDate(ParseQuoted(text, ref pos))); }
            if (c == 'l') { pos++; return new LLSD(new LLURI(ParseQuoted(text, ref pos))); }
            if (c == 'b')
            {
                if (pos + 4 <= text.Length && (text.Substring(pos, 4) == "b64\"" || text.Substring(pos, 4) == "b64'"))
                {
                    pos += 3;
                    return new LLSD(Convert.FromBase64String(ParseQuoted(text, ref pos)));
                }
            }
            if (c == '{')
            {
                pos++;
                var map = new Dictionary<string, LLSD>();
                while (pos < text.Length)
                {
                    SkipWs(text, ref pos);
                    if (pos < text.Length && text[pos] == '}') { pos++; break; }
                    string key = (pos < text.Length && (text[pos] == '\'' || text[pos] == '"')) ? ParseQuoted(text, ref pos) : "";
                    SkipWs(text, ref pos);
                    if (pos < text.Length && text[pos] == ':') pos++;
                    SkipWs(text, ref pos);
                    map[key] = ParseNotation(text, ref pos);
                    SkipWs(text, ref pos);
                    if (pos < text.Length && text[pos] == ',') pos++;
                }
                return new LLSD(map);
            }
            if (c == '[')
            {
                pos++;
                var list = new List<LLSD>();
                while (pos < text.Length)
                {
                    SkipWs(text, ref pos);
                    if (pos < text.Length && text[pos] == ']') { pos++; break; }
                    list.Add(ParseNotation(text, ref pos));
                    SkipWs(text, ref pos);
                    if (pos < text.Length && text[pos] == ',') pos++;
                }
                return new LLSD(list);
            }
            return LLSD.Undefined;
        }

        private static void SkipWs(string text, ref int pos)
        {
            while (pos < text.Length && char.IsWhiteSpace(text[pos])) pos++;
        }

        private static string ParseQuoted(string text, ref int pos)
        {
            if (pos >= text.Length) return "";
            char q = text[pos++];
            StringBuilder sb = new StringBuilder();
            while (pos < text.Length && text[pos] != q)
            {
                if (text[pos] == '\\' && pos + 1 < text.Length)
                {
                    pos++;
                    sb.Append(text[pos]);
                }
                else
                {
                    sb.Append(text[pos]);
                }
                pos++;
            }
            if (pos < text.Length) pos++;
            return sb.ToString();
        }

        // --- JSON ---
        public static string ToJSON(LLSD sd) => ToNotation(sd);
        public static LLSD FromJSON(string json) => FromNotation(json);
    }
}
