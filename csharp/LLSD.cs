using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;

namespace Unified.LLSD
{
    public enum LLSDType
    {
        Undefined = 0,
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

    public class LLSD : IEnumerable<KeyValuePair<string, LLSD>>
    {
        public LLSDType Type { get; private set; }

        private bool _boolVal;
        private long _longVal;
        private double _doubleVal;
        private string _stringVal = "";
        private LLUUID _uuidVal;
        private LLDate _dateVal;
        private LLURI _uriVal;
        private byte[] _binaryVal = Array.Empty<byte>();
        private Dictionary<string, LLSD>? _mapVal;
        private List<LLSD>? _arrayVal;

        public static readonly LLSD Undefined = new LLSD();

        public LLSD() { Type = LLSDType.Undefined; }
        public LLSD(bool val) { Type = LLSDType.Boolean; _boolVal = val; }
        public LLSD(int val) { Type = LLSDType.Integer; _longVal = val; }
        public LLSD(long val) { Type = LLSDType.Integer; _longVal = val; }
        public LLSD(double val) { Type = LLSDType.Real; _doubleVal = val; }
        public LLSD(string? val) { Type = LLSDType.String; _stringVal = val ?? ""; }
        public LLSD(LLUUID val) { Type = LLSDType.UUID; _uuidVal = val; }
        public LLSD(LLDate val) { Type = LLSDType.Date; _dateVal = val; }
        public LLSD(LLURI val) { Type = LLSDType.URI; _uriVal = val; }
        public LLSD(byte[]? val) { Type = LLSDType.Binary; _binaryVal = val ?? Array.Empty<byte>(); }
        public LLSD(Dictionary<string, LLSD> val) { Type = LLSDType.Map; _mapVal = val; }
        public LLSD(List<LLSD> val) { Type = LLSDType.Array; _arrayVal = val; }

        public bool IsUndefined => Type == LLSDType.Undefined;
        public bool IsDefined => Type != LLSDType.Undefined;

        public bool AsBoolean()
        {
            return Type switch
            {
                LLSDType.Boolean => _boolVal,
                LLSDType.Integer => _longVal != 0,
                LLSDType.Real => _doubleVal != 0.0,
                LLSDType.String => !string.IsNullOrEmpty(_stringVal),
                LLSDType.UUID => _uuidVal.NotNull,
                LLSDType.Date => _dateVal.NotNull,
                LLSDType.URI => !string.IsNullOrEmpty(_uriVal.Value),
                LLSDType.Binary => _binaryVal.Length > 0,
                LLSDType.Map => _mapVal != null && _mapVal.Count > 0,
                LLSDType.Array => _arrayVal != null && _arrayVal.Count > 0,
                _ => false
            };
        }

        public int AsInteger() => (int)AsLong();

        public long AsLong()
        {
            return Type switch
            {
                LLSDType.Boolean => _boolVal ? 1L : 0L,
                LLSDType.Integer => _longVal,
                LLSDType.Real => (long)_doubleVal,
                LLSDType.String => long.TryParse(_stringVal, out var l) ? l : 0L,
                _ => 0L
            };
        }

        public double AsReal()
        {
            return Type switch
            {
                LLSDType.Boolean => _boolVal ? 1.0 : 0.0,
                LLSDType.Integer => (double)_longVal,
                LLSDType.Real => _doubleVal,
                LLSDType.String => double.TryParse(_stringVal, NumberStyles.Any, CultureInfo.InvariantCulture, out var d) ? d : 0.0,
                _ => 0.0
            };
        }

        public string AsString()
        {
            return Type switch
            {
                LLSDType.Boolean => _boolVal ? "true" : "false",
                LLSDType.Integer => _longVal.ToString(CultureInfo.InvariantCulture),
                LLSDType.Real => _doubleVal.ToString(CultureInfo.InvariantCulture),
                LLSDType.String => _stringVal,
                LLSDType.UUID => _uuidVal.ToString(),
                LLSDType.Date => _dateVal.ToISOString(),
                LLSDType.URI => _uriVal.Value,
                LLSDType.Binary => Convert.ToBase64String(_binaryVal),
                _ => ""
            };
        }

        public LLUUID AsUUID() => Type == LLSDType.UUID ? _uuidVal : (Type == LLSDType.String ? new LLUUID(_stringVal) : LLUUID.Zero);
        public LLDate AsDate() => Type == LLSDType.Date ? _dateVal : (Type == LLSDType.String ? new LLDate(_stringVal) : LLDate.Zero);
        public LLURI AsURI() => Type == LLSDType.URI ? _uriVal : (Type == LLSDType.String ? new LLURI(_stringVal) : new LLURI(""));
        public byte[] AsBinary() => Type == LLSDType.Binary ? _binaryVal : Array.Empty<byte>();

        public int Count
        {
            get
            {
                if (Type == LLSDType.Map) return _mapVal?.Count ?? 0;
                if (Type == LLSDType.Array) return _arrayVal?.Count ?? 0;
                return 0;
            }
        }

        public bool ContainsKey(string key) => Type == LLSDType.Map && _mapVal != null && _mapVal.ContainsKey(key);

        public LLSD this[string key]
        {
            get
            {
                if (Type == LLSDType.Map && _mapVal != null && _mapVal.TryGetValue(key, out var val))
                    return val;
                return Undefined;
            }
            set
            {
                if (Type != LLSDType.Map)
                {
                    Type = LLSDType.Map;
                    _mapVal = new Dictionary<string, LLSD>();
                }
                _mapVal![key] = value ?? Undefined;
            }
        }

        public LLSD this[int index]
        {
            get
            {
                if (Type == LLSDType.Array && _arrayVal != null && index >= 0 && index < _arrayVal.Count)
                    return _arrayVal[index];
                return Undefined;
            }
            set
            {
                if (Type != LLSDType.Array)
                {
                    Type = LLSDType.Array;
                    _arrayVal = new List<LLSD>();
                }
                while (_arrayVal!.Count <= index)
                    _arrayVal.Add(Undefined);
                _arrayVal[index] = value ?? Undefined;
            }
        }

        public static LLSD EmptyMap() => new LLSD(new Dictionary<string, LLSD>());
        public static LLSD EmptyArray() => new LLSD(new List<LLSD>());

        public IEnumerator<KeyValuePair<string, LLSD>> GetEnumerator()
        {
            if (Type == LLSDType.Map && _mapVal != null)
                return _mapVal.GetEnumerator();
            return ((IEnumerable<KeyValuePair<string, LLSD>>)Array.Empty<KeyValuePair<string, LLSD>>()).GetEnumerator();
        }

        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();

        // Implicit conversions
        public static implicit operator LLSD(bool v) => new LLSD(v);
        public static implicit operator LLSD(int v) => new LLSD(v);
        public static implicit operator LLSD(long v) => new LLSD(v);
        public static implicit operator LLSD(double v) => new LLSD(v);
        public static implicit operator LLSD(string v) => new LLSD(v);
        public static implicit operator LLSD(LLUUID v) => new LLSD(v);
        public static implicit operator LLSD(LLDate v) => new LLSD(v);
        public static implicit operator LLSD(byte[] v) => new LLSD(v);

        public static implicit operator bool(LLSD s) => s.AsBoolean();
        public static implicit operator int(LLSD s) => s.AsInteger();
        public static implicit operator long(LLSD s) => s.AsLong();
        public static implicit operator double(LLSD s) => s.AsReal();
        public static implicit operator string(LLSD s) => s.AsString();
    }
}
