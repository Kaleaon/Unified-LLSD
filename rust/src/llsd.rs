use std::collections::BTreeMap;
use std::ops::Index;
use super::uuid::LlUuid;
use super::date::LlDate;
use super::uri::LlUri;

#[derive(Debug, Clone, PartialEq)]
pub enum Llsd {
    Undefined,
    Boolean(bool),
    Integer(i64), // 64-bit integer support
    Real(f64),
    String(String),
    Uuid(LlUuid),
    Date(LlDate),
    Uri(LlUri),
    Binary(Vec<u8>),
    Map(BTreeMap<String, Llsd>),
    Array(Vec<Llsd>),
}

impl Llsd {
    pub fn is_undefined(&self) -> bool {
        matches!(self, Llsd::Undefined)
    }

    pub fn is_defined(&self) -> bool {
        !self.is_undefined()
    }

    pub fn as_bool(&self) -> bool {
        match self {
            Llsd::Boolean(b) => *b,
            Llsd::Integer(i) => *i != 0,
            Llsd::Real(r) => *r != 0.0,
            Llsd::String(s) => !s.is_empty(),
            Llsd::Uuid(u) => u.not_null(),
            Llsd::Date(d) => d.not_null(),
            Llsd::Uri(u) => !u.as_str().is_empty(),
            Llsd::Binary(b) => !b.is_empty(),
            Llsd::Map(m) => !m.is_empty(),
            Llsd::Array(a) => !a.is_empty(),
            Llsd::Undefined => false,
        }
    }

    pub fn as_i64(&self) -> i64 {
        match self {
            Llsd::Boolean(b) => if *b { 1 } else { 0 },
            Llsd::Integer(i) => *i,
            Llsd::Real(r) => *r as i64,
            Llsd::String(s) => s.parse().unwrap_or(0),
            _ => 0,
        }
    }

    pub fn as_i32(&self) -> i32 {
        self.as_i64() as i32
    }

    pub fn as_f64(&self) -> f64 {
        match self {
            Llsd::Boolean(b) => if *b { 1.0 } else { 0.0 },
            Llsd::Integer(i) => *i as f64,
            Llsd::Real(r) => *r,
            Llsd::String(s) => match s.to_lowercase().as_str() {
                "nan" => f64::NAN,
                "inf" | "+inf" => f64::INFINITY,
                "-inf" => f64::NEG_INFINITY,
                _ => s.parse().unwrap_or(0.0),
            },
            _ => 0.0,
        }
    }

    pub fn as_string(&self) -> String {
        match self {
            Llsd::Boolean(b) => if *b { "true".to_string() } else { "false".to_string() },
            Llsd::Integer(i) => i.to_string(),
            Llsd::Real(r) => {
                if r.is_nan() { "nan".to_string() }
                else if r.is_infinite() { if *r > 0.0 { "inf".to_string() } else { "-inf".to_string() } }
                else { r.to_string() }
            },
            Llsd::String(s) => s.clone(),
            Llsd::Uuid(u) => u.to_string(),
            Llsd::Date(d) => d.to_iso_string(),
            Llsd::Uri(u) => u.as_str().to_string(),
            Llsd::Binary(b) => base64_encode(b),
            _ => String::new(),
        }
    }

    pub fn as_uuid(&self) -> LlUuid {
        match self {
            Llsd::Uuid(u) => u.clone(),
            Llsd::String(s) => LlUuid::from_string(s).unwrap_or(LlUuid::NULL),
            _ => LlUuid::NULL,
        }
    }

    pub fn as_date(&self) -> LlDate {
        match self {
            Llsd::Date(d) => d.clone(),
            Llsd::String(s) => LlDate::from_iso_string(s).unwrap_or(LlDate::NULL),
            _ => LlDate::NULL,
        }
    }

    pub fn as_uri(&self) -> LlUri {
        match self {
            Llsd::Uri(u) => u.clone(),
            Llsd::String(s) => LlUri::new(s),
            _ => LlUri::default(),
        }
    }

    pub fn as_binary(&self) -> Vec<u8> {
        match self {
            Llsd::Binary(b) => b.clone(),
            _ => Vec::new(),
        }
    }

    pub fn len(&self) -> usize {
        match self {
            Llsd::Map(m) => m.len(),
            Llsd::Array(a) => a.len(),
            _ => 0,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn get_key(&self, key: &str) -> &Llsd {
        if let Llsd::Map(m) = self {
            m.get(key).unwrap_or(&Llsd::Undefined)
        } else {
            &Llsd::Undefined
        }
    }

    pub fn get_idx(&self, index: usize) -> &Llsd {
        if let Llsd::Array(a) = self {
            a.get(index).unwrap_or(&Llsd::Undefined)
        } else {
            &Llsd::Undefined
        }
    }

    pub fn empty_map() -> Llsd {
        Llsd::Map(BTreeMap::new())
    }

    pub fn empty_array() -> Llsd {
        Llsd::Array(Vec::new())
    }
}

impl Default for Llsd {
    fn default() -> Self {
        Llsd::Undefined
    }
}

impl<'a> Index<&'a str> for Llsd {
    type Output = Llsd;
    fn index(&self, key: &'a str) -> &Self::Output {
        self.get_key(key)
    }
}

impl Index<usize> for Llsd {
    type Output = Llsd;
    fn index(&self, index: usize) -> &Self::Output {
        self.get_idx(index)
    }
}

pub fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    let mut i = 0;
    while i < data.len() {
        let b0 = data[i] as u32;
        let b1 = if i + 1 < data.len() { data[i + 1] as u32 } else { 0 };
        let b2 = if i + 2 < data.len() { data[i + 2] as u32 } else { 0 };

        let triple = (b0 << 16) | (b1 << 8) | b2;

        result.push(CHARS[((triple >> 18) & 63) as usize] as char);
        result.push(CHARS[((triple >> 12) & 63) as usize] as char);

        if i + 1 < data.len() {
            result.push(CHARS[((triple >> 6) & 63) as usize] as char);
        } else {
            result.push('=');
        }

        if i + 2 < data.len() {
            result.push(CHARS[(triple & 63) as usize] as char);
        } else {
            result.push('=');
        }

        i += 3;
    }
    result
}

pub fn base64_decode(s: &str) -> Vec<u8> {
    let clean: String = s.chars().filter(|c| !c.is_whitespace() && *c != '=').collect();
    let mut bytes = Vec::new();
    let chars: Vec<char> = clean.chars().collect();

    fn val(c: char) -> u32 {
        match c {
            'A'..='Z' => c as u32 - 'A' as u32,
            'a'..='z' => c as u32 - 'a' as u32 + 26,
            '0'..='9' => c as u32 - '0' as u32 + 52,
            '+' => 62,
            '/' => 63,
            _ => 0,
        }
    }

    let mut i = 0;
    while i < chars.len() {
        let c0 = val(chars[i]);
        let c1 = if i + 1 < chars.len() { val(chars[i + 1]) } else { 0 };
        let c2 = if i + 2 < chars.len() { val(chars[i + 2]) } else { 0 };
        let c3 = if i + 3 < chars.len() { val(chars[i + 3]) } else { 0 };

        let triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;

        if i + 1 < chars.len() {
            bytes.push(((triple >> 16) & 255) as u8);
        }
        if i + 2 < chars.len() {
            bytes.push(((triple >> 8) & 255) as u8);
        }
        if i + 3 < chars.len() {
            bytes.push((triple & 255) as u8);
        }

        i += 4;
    }
    bytes
}

#[cfg(feature = "serde")]
impl serde::Serialize for Llsd {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Llsd::Undefined => serializer.serialize_unit(),
            Llsd::Boolean(b) => serializer.serialize_bool(*b),
            Llsd::Integer(i) => serializer.serialize_i64(*i),
            Llsd::Real(r) => {
                if r.is_nan() || r.is_infinite() {
                    serializer.serialize_unit()
                } else {
                    serializer.serialize_f64(*r)
                }
            }
            Llsd::String(s) => serializer.serialize_str(s),
            Llsd::Uuid(u) => serializer.serialize_str(&u.to_string()),
            Llsd::Date(d) => serializer.serialize_str(&d.to_iso_string()),
            Llsd::Uri(u) => serializer.serialize_str(u.as_str()),
            Llsd::Binary(b) => serializer.serialize_str(&base64_encode(b)),
            Llsd::Map(m) => {
                use serde::ser::SerializeMap;
                let mut map = serializer.serialize_map(Some(m.len()))?;
                for (k, v) in m {
                    map.serialize_entry(k, v)?;
                }
                map.end()
            }
            Llsd::Array(a) => {
                use serde::ser::SerializeSeq;
                let mut seq = serializer.serialize_seq(Some(a.len()))?;
                for v in a {
                    seq.serialize_element(v)?;
                }
                seq.end()
            }
        }
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for Llsd {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct LlsdVisitor;

        impl<'de> serde::de::Visitor<'de> for LlsdVisitor {
            type Value = Llsd;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("any valid LLSD JSON value")
            }

            fn visit_unit<E>(self) -> Result<Llsd, E>
            where
                E: serde::de::Error,
            {
                Ok(Llsd::Undefined)
            }

            fn visit_none<E>(self) -> Result<Llsd, E>
            where
                E: serde::de::Error,
            {
                Ok(Llsd::Undefined)
            }

            fn visit_bool<E>(self, v: bool) -> Result<Llsd, E>
            where
                E: serde::de::Error,
            {
                Ok(Llsd::Boolean(v))
            }

            fn visit_i64<E>(self, v: i64) -> Result<Llsd, E>
            where
                E: serde::de::Error,
            {
                Ok(Llsd::Integer(v))
            }

            fn visit_u64<E>(self, v: u64) -> Result<Llsd, E>
            where
                E: serde::de::Error,
            {
                if v <= i64::MAX as u64 {
                    Ok(Llsd::Integer(v as i64))
                } else {
                    Ok(Llsd::Real(v as f64))
                }
            }

            fn visit_f64<E>(self, v: f64) -> Result<Llsd, E>
            where
                E: serde::de::Error,
            {
                Ok(Llsd::Real(v))
            }

            fn visit_str<E>(self, v: &str) -> Result<Llsd, E>
            where
                E: serde::de::Error,
            {
                Ok(Llsd::String(v.to_string()))
            }

            fn visit_string<E>(self, v: String) -> Result<Llsd, E>
            where
                E: serde::de::Error,
            {
                Ok(Llsd::String(v))
            }

            fn visit_map<M>(self, mut access: M) -> Result<Llsd, M::Error>
            where
                M: serde::de::MapAccess<'de>,
            {
                let mut map = BTreeMap::new();
                while let Some((key, value)) = access.next_entry::<String, Llsd>()? {
                    map.insert(key, value);
                }
                Ok(Llsd::Map(map))
            }

            fn visit_seq<A>(self, mut access: A) -> Result<Llsd, A::Error>
            where
                A: serde::de::SeqAccess<'de>,
            {
                let mut seq = Vec::new();
                while let Some(element) = access.next_element::<Llsd>()? {
                    seq.push(element);
                }
                Ok(Llsd::Array(seq))
            }
        }

        deserializer.deserialize_any(LlsdVisitor)
    }
}

