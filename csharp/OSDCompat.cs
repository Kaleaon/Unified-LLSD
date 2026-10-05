using System;
using System.Collections;
using System.Collections.Generic;
using Unified.LLSD;

namespace OpenMetaverse
{
    public struct UUID : IEquatable<UUID>
    {
        public Guid GuidData;
        public static readonly UUID Zero = new UUID(Guid.Empty);

        public UUID(Guid guid) { GuidData = guid; }
        public UUID(string str) { GuidData = Guid.TryParse(str, out var g) ? g : Guid.Empty; }

        public bool IsNull => GuidData == Guid.Empty;
        public override string ToString() => GuidData.ToString("d");
        public bool Equals(UUID other) => GuidData.Equals(other.GuidData);
        public override bool Equals(object? obj) => obj is UUID other && Equals(other);
        public override int GetHashCode() => GuidData.GetHashCode();
        public static bool operator ==(UUID a, UUID b) => a.Equals(b);
        public static bool operator !=(UUID a, UUID b) => !a.Equals(b);
    }
}

namespace OpenMetaverse.StructuredData
{
    public enum OSDType
    {
        Unknown = 0,
        Boolean,
        Integer,
        Real,
        String,
        UUID,
        Date,
        URI,
        Binary,
        Map,
        Array
    }

    public class OSD
    {
        public LLSD Inner { get; protected set; } = LLSD.Undefined;

        public OSD() { }
        public OSD(LLSD inner) { Inner = inner; }

        public OSDType Type => Inner.Type switch
        {
            LLSDType.Boolean => OSDType.Boolean,
            LLSDType.Integer => OSDType.Integer,
            LLSDType.Real => OSDType.Real,
            LLSDType.String => OSDType.String,
            LLSDType.UUID => OSDType.UUID,
            LLSDType.Date => OSDType.Date,
            LLSDType.URI => OSDType.URI,
            LLSDType.Binary => OSDType.Binary,
            LLSDType.Map => OSDType.Map,
            LLSDType.Array => OSDType.Array,
            _ => OSDType.Unknown
        };

        public bool AsBoolean() => Inner.AsBoolean();
        public int AsInteger() => Inner.AsInteger();
        public long AsLong() => Inner.AsLong();
        public double AsReal() => Inner.AsReal();
        public string AsString() => Inner.AsString();
        public UUID AsUUID() => new UUID(Inner.AsUUID().GuidData);
        public byte[] AsBinary() => Inner.AsBinary();

        public static implicit operator bool(OSD osd) => osd.AsBoolean();
        public static implicit operator int(OSD osd) => osd.AsInteger();
        public static implicit operator long(OSD osd) => osd.AsLong();
        public static implicit operator double(OSD osd) => osd.AsReal();
        public static implicit operator string(OSD osd) => osd.AsString();
        public static implicit operator OSD(bool v) => new OSDBoolean(v);
        public static implicit operator OSD(int v) => new OSDInteger(v);
        public static implicit operator OSD(double v) => new OSDReal(v);
        public static implicit operator OSD(string v) => new OSDString(v);
    }

    public class OSDBoolean : OSD
    {
        public OSDBoolean(bool value) : base(new LLSD(value)) { }
    }

    public class OSDInteger : OSD
    {
        public OSDInteger(int value) : base(new LLSD(value)) { }
        public OSDInteger(long value) : base(new LLSD(value)) { }
    }

    public class OSDReal : OSD
    {
        public OSDReal(double value) : base(new LLSD(value)) { }
    }

    public class OSDString : OSD
    {
        public OSDString(string value) : base(new LLSD(value)) { }
    }

    public class OSDUUID : OSD
    {
        public OSDUUID(UUID value) : base(new LLSD(new LLUUID(value.GuidData))) { }
    }

    public class OSDMap : OSD, IDictionary<string, OSD>
    {
        public OSDMap() : base(LLSD.EmptyMap()) { }
        public OSDMap(LLSD inner) : base(inner) { }

        public OSD this[string key]
        {
            get => new OSD(Inner[key]);
            set => Inner[key] = value?.Inner ?? LLSD.Undefined;
        }

        public bool ContainsKey(string key) => Inner.ContainsKey(key);
        public bool Remove(string key) => false;
        public bool TryGetValue(string key, out OSD value)
        {
            if (Inner.ContainsKey(key))
            {
                value = new OSD(Inner[key]);
                return true;
            }
            value = new OSD(LLSD.Undefined);
            return false;
        }

        public void Add(string key, OSD value) => Inner[key] = value?.Inner ?? LLSD.Undefined;
        public void Clear() { }
        public int Count => Inner.Count;
        public bool IsReadOnly => false;

        public ICollection<string> Keys
        {
            get
            {
                var keys = new List<string>();
                foreach (var pair in Inner) keys.Add(pair.Key);
                return keys;
            }
        }

        public ICollection<OSD> Values
        {
            get
            {
                var vals = new List<OSD>();
                foreach (var pair in Inner) vals.Add(new OSD(pair.Value));
                return vals;
            }
        }

        public void Add(KeyValuePair<string, OSD> item) => Add(item.Key, item.Value);
        public bool Contains(KeyValuePair<string, OSD> item) => ContainsKey(item.Key);
        public void CopyTo(KeyValuePair<string, OSD>[] array, int arrayIndex) { }
        public bool Remove(KeyValuePair<string, OSD> item) => false;

        public IEnumerator<KeyValuePair<string, OSD>> GetEnumerator()
        {
            foreach (var pair in Inner)
            {
                yield return new KeyValuePair<string, OSD>(pair.Key, new OSD(pair.Value));
            }
        }

        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }

    public class OSDArray : OSD, IList<OSD>
    {
        public OSDArray() : base(LLSD.EmptyArray()) { }
        public OSDArray(LLSD inner) : base(inner) { }

        public OSD this[int index]
        {
            get => new OSD(Inner[index]);
            set => Inner[index] = value?.Inner ?? LLSD.Undefined;
        }

        public int Count => Inner.Count;
        public bool IsReadOnly => false;

        public void Add(OSD item) => Inner[Inner.Count] = item?.Inner ?? LLSD.Undefined;
        public void Clear() { }
        public bool Contains(OSD item) => false;
        public void CopyTo(OSD[] array, int arrayIndex) { }
        public int IndexOf(OSD item) => -1;
        public void Insert(int index, OSD item) => Inner[index] = item?.Inner ?? LLSD.Undefined;
        public bool Remove(OSD item) => false;
        public void RemoveAt(int index) { }

        public IEnumerator<OSD> GetEnumerator()
        {
            for (int i = 0; i < Inner.Count; i++)
            {
                yield return new OSD(Inner[i]);
            }
        }

        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }

    public static class OSDParser
    {
        public static OSD DeserializeXml(string xml) => new OSD(LLSDSerialize.FromXML(xml));
        public static string SerializeXmlString(OSD osd) => LLSDSerialize.ToXML(osd.Inner);
        public static OSD DeserializeBinary(byte[] bytes) => new OSD(LLSDSerialize.FromBinary(bytes));
        public static byte[] SerializeBinary(OSD osd) => LLSDSerialize.ToBinary(osd.Inner);
        public static OSD DeserializeNotation(string text) => new OSD(LLSDSerialize.FromNotation(text));
        public static string SerializeNotation(OSD osd) => LLSDSerialize.ToNotation(osd.Inner);
    }
}
