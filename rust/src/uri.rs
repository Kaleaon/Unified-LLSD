use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
pub struct LlUri {
    pub uri: String,
}

impl LlUri {
    pub fn new(s: &str) -> Self {
        LlUri { uri: s.to_string() }
    }

    pub fn as_str(&self) -> &str {
        &self.uri
    }
}

impl fmt::Display for LlUri {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.uri)
    }
}
