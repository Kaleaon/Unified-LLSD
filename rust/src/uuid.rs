use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct LlUuid {
    pub bytes: [u8; 16],
}

impl LlUuid {
    pub const NULL: LlUuid = LlUuid { bytes: [0; 16] };

    pub fn new(bytes: [u8; 16]) -> Self {
        LlUuid { bytes }
    }

    pub fn is_null(&self) -> bool {
        self.bytes.iter().all(|&b| b == 0)
    }

    pub fn not_null(&self) -> bool {
        !self.is_null()
    }

    pub fn from_string(s: &str) -> Option<Self> {
        let clean: String = s.chars().filter(|c| *c != '-' && *c != '{' && *c != '}').collect();
        if clean.len() != 32 {
            return None;
        }
        let mut bytes = [0u8; 16];
        for i in 0..16 {
            bytes[i] = u8::from_str_radix(&clean[i * 2..i * 2 + 2], 16).ok()?;
        }
        Some(LlUuid { bytes })
    }

    pub fn to_string(&self) -> String {
        format!(
            "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
            self.bytes[0], self.bytes[1], self.bytes[2], self.bytes[3],
            self.bytes[4], self.bytes[5],
            self.bytes[6], self.bytes[7],
            self.bytes[8], self.bytes[9],
            self.bytes[10], self.bytes[11], self.bytes[12], self.bytes[13], self.bytes[14], self.bytes[15]
        )
    }
}

impl Default for LlUuid {
    fn default() -> Self {
        LlUuid::NULL
    }
}

impl fmt::Display for LlUuid {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_string())
    }
}
