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

pub const DECODE_TABLE: [i8; 256] = {
    let mut table = [-3i8; 256];

    // Whitespace sentinels
    table[b' ' as usize] = -1;
    table[b'\t' as usize] = -1;
    table[b'\r' as usize] = -1;
    table[b'\n' as usize] = -1;

    // Padding sentinel
    table[b'=' as usize] = -2;

    // Base64 6-bit values
    let mut i = 0;
    while i < 26 {
        table[(b'A' + i) as usize] = i as i8;
        i += 1;
    }

    let mut i = 0;
    while i < 26 {
        table[(b'a' + i) as usize] = (26 + i) as i8;
        i += 1;
    }

    let mut i = 0;
    while i < 10 {
        table[(b'0' + i) as usize] = (52 + i) as i8;
        i += 1;
    }

    table[b'+' as usize] = 62;
    table[b'/' as usize] = 63;

    table
};

pub fn base64_decode(s: &str) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(s.len() * 3 / 4);
    let mut buf: u32 = 0;
    let mut count: usize = 0;

    for &b in s.as_bytes() {
        let val = DECODE_TABLE[b as usize];
        if val >= 0 {
            buf = (buf << 6) | (val as u32);
            count += 1;
            if count == 4 {
                bytes.push(((buf >> 16) & 0xFF) as u8);
                bytes.push(((buf >> 8) & 0xFF) as u8);
                bytes.push((buf & 0xFF) as u8);
                buf = 0;
                count = 0;
            }
        }
    }

    match count {
        3 => {
            buf <<= 6;
            bytes.push(((buf >> 16) & 0xFF) as u8);
            bytes.push(((buf >> 8) & 0xFF) as u8);
        }
        2 => {
            buf <<= 12;
            bytes.push(((buf >> 16) & 0xFF) as u8);
        }
        _ => {}
    }

    bytes
}
