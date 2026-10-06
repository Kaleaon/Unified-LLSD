use std::collections::BTreeMap;
use super::llsd::{Llsd, base64_encode, base64_decode};
use super::uuid::LlUuid;
use super::date::LlDate;
use super::uri::LlUri;

pub const BINARY_HEADER: &str = "<? llsd/binary ?>\n";
pub const NOTATION_HEADER: &str = "<? llsd/notation ?>\n";
pub const XML_HEADER: &str = "<?xml version=\"1.0\" ?>\n";

// --- XML ---
pub fn to_xml(sd: &Llsd, with_declaration: bool) -> String {
    let mut out = String::new();
    if with_declaration {
        out.push_str(XML_HEADER);
    }
    out.push_str("<llsd>");
    write_xml_element(&mut out, sd);
    out.push_str("</llsd>");
    out
}

fn write_xml_element(out: &mut String, sd: &Llsd) {
    match sd {
        Llsd::Undefined => out.push_str("<undef/>"),
        Llsd::Boolean(b) => out.push_str(&format!("<boolean>{}</boolean>", if *b { "true" } else { "false" })),
        Llsd::Integer(i) => out.push_str(&format!("<integer>{}</integer>", i)),
        Llsd::Real(r) => {
            if r.is_nan() { out.push_str("<real>nan</real>"); }
            else if r.is_infinite() { out.push_str(if *r > 0.0 { "<real>inf</real>" } else { "<real>-inf</real>" }); }
            else { out.push_str(&format!("<real>{}</real>", r)); }
        },
        Llsd::String(s) => {
            if s.is_empty() { out.push_str("<string/>"); }
            else { out.push_str(&format!("<string>{}</string>", xml_escape(s))); }
        },
        Llsd::Uuid(u) => {
            if u.is_null() { out.push_str("<uuid/>"); }
            else { out.push_str(&format!("<uuid>{}</uuid>", u)); }
        },
        Llsd::Date(d) => out.push_str(&format!("<date>{}</date>", d.to_iso_string())),
        Llsd::Uri(u) => out.push_str(&format!("<uri>{}</uri>", xml_escape(u.as_str()))),
        Llsd::Binary(b) => out.push_str(&format!("<binary encoding=\"base64\">{}</binary>", base64_encode(b))),
        Llsd::Map(m) => {
            out.push_str("<map>");
            for (k, v) in m {
                out.push_str(&format!("<key>{}</key>", xml_escape(k)));
                write_xml_element(out, v);
            }
            out.push_str("</map>");
        },
        Llsd::Array(a) => {
            out.push_str("<array>");
            for v in a {
                write_xml_element(out, v);
            }
            out.push_str("</array>");
        },
    }
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

pub fn from_xml(xml: &str) -> Llsd {
    let clean = xml.trim();
    if clean.is_empty() { return Llsd::Undefined; }
    let mut pos = 0;
    parse_xml_node(clean, &mut pos)
}

fn parse_xml_node(xml: &str, pos: &mut usize) -> Llsd {
    // Find next '<'
    while *pos < xml.len() {
        if let Some(open) = xml[*pos..].find('<') {
            *pos += open;
            if xml[*pos..].starts_with("<?") || xml[*pos..].starts_with("<!--") {
                if let Some(close) = xml[*pos..].find('>') {
                    *pos += close + 1;
                    continue;
                }
            }
            // Parse tag
            if let Some(close) = xml[*pos..].find('>') {
                let tag_header = &xml[*pos + 1..*pos + close];
                let self_closing = tag_header.ends_with('/');
                let clean_header = tag_header.trim_end_matches('/');
                let mut parts = clean_header.split_whitespace();
                let tag_name = parts.next().unwrap_or("");

                *pos += close + 1;

                if tag_name == "llsd" {
                    return parse_xml_node(xml, pos);
                } else if tag_name == "undef" {
                    return Llsd::Undefined;
                }

                let content = if self_closing {
                    ""
                } else {
                    let end_tag = format!("</{}>", tag_name);
                    if let Some(end_pos) = xml[*pos..].find(&end_tag) {
                        let c = &xml[*pos..*pos + end_pos];
                        *pos += end_pos + end_tag.len();
                        c
                    } else {
                        ""
                    }
                };

                return match tag_name {
                    "boolean" => {
                        let t = content.trim().to_lowercase();
                        Llsd::Boolean(t == "true" || t == "1" || t == "t")
                    },
                    "integer" => Llsd::Integer(content.trim().parse().unwrap_or(0)),
                    "real" => {
                        let t = content.trim().to_lowercase();
                        if t == "nan" { Llsd::Real(f64::NAN) }
                        else if t == "inf" || t == "+inf" { Llsd::Real(f64::INFINITY) }
                        else if t == "-inf" { Llsd::Real(f64::NEG_INFINITY) }
                        else { Llsd::Real(t.parse().unwrap_or(0.0)) }
                    },
                    "string" => Llsd::String(content.to_string()),
                    "uuid" => Llsd::Uuid(LlUuid::from_string(content.trim()).unwrap_or(LlUuid::NULL)),
                    "date" => Llsd::Date(LlDate::from_iso_string(content.trim()).unwrap_or(LlDate::NULL)),
                    "uri" => Llsd::Uri(LlUri::new(content.trim())),
                    "binary" => Llsd::Binary(base64_decode(content.trim())),
                    "map" => {
                        let mut map = BTreeMap::new();
                        let mut inner_pos = 0;
                        while inner_pos < content.len() {
                            if let Some(k_start) = content[inner_pos..].find("<key>") {
                                inner_pos += k_start + 5;
                                if let Some(k_end) = content[inner_pos..].find("</key>") {
                                    let key = &content[inner_pos..inner_pos + k_end];
                                    inner_pos += k_end + 6;
                                    let val = parse_xml_node(content, &mut inner_pos);
                                    map.insert(key.to_string(), val);
                                } else { break; }
                            } else { break; }
                        }
                        Llsd::Map(map)
                    },
                    "array" => {
                        let mut arr = Vec::new();
                        let mut inner_pos = 0;
                        while inner_pos < content.len() {
                            if content[inner_pos..].contains('<') {
                                arr.push(parse_xml_node(content, &mut inner_pos));
                            } else { break; }
                        }
                        Llsd::Array(arr)
                    },
                    _ => Llsd::Undefined,
                };
            } else { break; }
        } else { break; }
    }
    Llsd::Undefined
}

// --- Binary ---
pub fn to_binary(sd: &Llsd) -> Vec<u8> {
    let mut out = Vec::new();
    write_binary(&mut out, sd);
    out
}

fn write_binary(out: &mut Vec<u8>, sd: &Llsd) {
    match sd {
        Llsd::Undefined => out.push(b'!'),
        Llsd::Boolean(b) => out.push(if *b { b'1' } else { b'0' }),
        Llsd::Integer(i) => {
            out.push(b'i');
            out.extend_from_slice(&(*i as i32).to_be_bytes());
        },
        Llsd::Real(r) => {
            out.push(b'r');
            out.extend_from_slice(&r.to_be_bytes());
        },
        Llsd::String(s) => {
            out.push(b's');
            out.extend_from_slice(&(s.len() as u32).to_be_bytes());
            out.extend_from_slice(s.as_bytes());
        },
        Llsd::Uuid(u) => {
            out.push(b'u');
            out.extend_from_slice(&u.bytes);
        },
        Llsd::Date(d) => {
            out.push(b'd');
            // Date is LE 8-byte double!
            out.extend_from_slice(&d.seconds_since_epoch.to_le_bytes());
        },
        Llsd::Uri(u) => {
            out.push(b'l');
            out.extend_from_slice(&(u.as_str().len() as u32).to_be_bytes());
            out.extend_from_slice(u.as_str().as_bytes());
        },
        Llsd::Binary(b) => {
            out.push(b'b');
            out.extend_from_slice(&(b.len() as u32).to_be_bytes());
            out.extend_from_slice(b);
        },
        Llsd::Map(m) => {
            out.push(b'{');
            out.extend_from_slice(&(m.len() as u32).to_be_bytes());
            for (k, v) in m {
                out.push(b'k');
                out.extend_from_slice(&(k.len() as u32).to_be_bytes());
                out.extend_from_slice(k.as_bytes());
                write_binary(out, v);
            }
            out.push(b'}');
        },
        Llsd::Array(a) => {
            out.push(b'[');
            out.extend_from_slice(&(a.len() as u32).to_be_bytes());
            for v in a {
                write_binary(out, v);
            }
            out.push(b']');
        },
    }
}

pub fn from_binary(bytes: &[u8]) -> Llsd {
    if bytes.is_empty() { return Llsd::Undefined; }
    let mut pos = 0;
    if bytes.starts_with(BINARY_HEADER.as_bytes()) {
        pos = BINARY_HEADER.len();
    }
    read_binary(bytes, &mut pos)
}

fn read_binary(bytes: &[u8], pos: &mut usize) -> Llsd {
    if *pos >= bytes.len() { return Llsd::Undefined; }
    let tag = bytes[*pos];
    *pos += 1;
    match tag {
        b'!' => Llsd::Undefined,
        b'1' => Llsd::Boolean(true),
        b'0' => Llsd::Boolean(false),
        b'i' => {
            if *pos + 4 > bytes.len() { return Llsd::Undefined; }
            let v = i32::from_be_bytes(bytes[*pos..*pos + 4].try_into().unwrap());
            *pos += 4;
            Llsd::Integer(v as i64)
        },
        b'r' => {
            if *pos + 8 > bytes.len() { return Llsd::Undefined; }
            let v = f64::from_be_bytes(bytes[*pos..*pos + 8].try_into().unwrap());
            *pos += 8;
            Llsd::Real(v)
        },
        b's' => {
            if *pos + 4 > bytes.len() { return Llsd::Undefined; }
            let len = u32::from_be_bytes(bytes[*pos..*pos + 4].try_into().unwrap()) as usize;
            *pos += 4;
            if *pos + len > bytes.len() { return Llsd::Undefined; }
            let s = String::from_utf8_lossy(&bytes[*pos..*pos + len]).to_string();
            *pos += len;
            Llsd::String(s)
        },
        b'u' => {
            if *pos + 16 > bytes.len() { return Llsd::Undefined; }
            let mut u_bytes = [0u8; 16];
            u_bytes.copy_from_slice(&bytes[*pos..*pos + 16]);
            *pos += 16;
            Llsd::Uuid(LlUuid::new(u_bytes))
        },
        b'd' => {
            if *pos + 8 > bytes.len() { return Llsd::Undefined; }
            let v = f64::from_le_bytes(bytes[*pos..*pos + 8].try_into().unwrap());
            *pos += 8;
            Llsd::Date(LlDate::new(v))
        },
        b'l' => {
            if *pos + 4 > bytes.len() { return Llsd::Undefined; }
            let len = u32::from_be_bytes(bytes[*pos..*pos + 4].try_into().unwrap()) as usize;
            *pos += 4;
            if *pos + len > bytes.len() { return Llsd::Undefined; }
            let u = String::from_utf8_lossy(&bytes[*pos..*pos + len]).to_string();
            *pos += len;
            Llsd::Uri(LlUri::new(&u))
        },
        b'b' => {
            if *pos + 4 > bytes.len() { return Llsd::Undefined; }
            let len = u32::from_be_bytes(bytes[*pos..*pos + 4].try_into().unwrap()) as usize;
            *pos += 4;
            if *pos + len > bytes.len() { return Llsd::Undefined; }
            let bin = bytes[*pos..*pos + len].to_vec();
            *pos += len;
            Llsd::Binary(bin)
        },
        b'{' => {
            if *pos + 4 > bytes.len() { return Llsd::Undefined; }
            let count = u32::from_be_bytes(bytes[*pos..*pos + 4].try_into().unwrap()) as usize;
            *pos += 4;
            let mut map = BTreeMap::new();
            for _ in 0..count {
                if *pos >= bytes.len() || bytes[*pos] != b'k' { break; }
                *pos += 1;
                if *pos + 4 > bytes.len() { break; }
                let klen = u32::from_be_bytes(bytes[*pos..*pos + 4].try_into().unwrap()) as usize;
                *pos += 4;
                if *pos + klen > bytes.len() { break; }
                let key = String::from_utf8_lossy(&bytes[*pos..*pos + klen]).to_string();
                *pos += klen;
                let val = read_binary(bytes, pos);
                map.insert(key, val);
            }
            if *pos < bytes.len() && bytes[*pos] == b'}' { *pos += 1; }
            Llsd::Map(map)
        },
        b'[' => {
            if *pos + 4 > bytes.len() { return Llsd::Undefined; }
            let count = u32::from_be_bytes(bytes[*pos..*pos + 4].try_into().unwrap()) as usize;
            *pos += 4;
            let mut arr = Vec::new();
            for _ in 0..count {
                arr.push(read_binary(bytes, pos));
            }
            if *pos < bytes.len() && bytes[*pos] == b']' { *pos += 1; }
            Llsd::Array(arr)
        },
        _ => Llsd::Undefined,
    }
}

// --- Notation ---
pub fn to_notation(sd: &Llsd) -> String {
    let mut out = String::new();
    write_notation(&mut out, sd);
    out
}

fn write_notation(out: &mut String, sd: &Llsd) {
    match sd {
        Llsd::Undefined => out.push('!'),
        Llsd::Boolean(b) => out.push_str(if *b { "true" } else { "false" }),
        Llsd::Integer(i) => out.push_str(&format!("i{}", i)),
        Llsd::Real(r) => {
            if r.is_nan() { out.push_str("rnan"); }
            else if r.is_infinite() { out.push_str(if *r > 0.0 { "rinf" } else { "r-inf" }); }
            else { out.push_str(&format!("r{}", r)); }
        },
        Llsd::String(s) => {
            out.push('\'');
            for c in s.chars() {
                if c == '\'' || c == '\\' { out.push('\\'); }
                out.push(c);
            }
            out.push('\'');
        },
        Llsd::Uuid(u) => out.push_str(&format!("u{}", u)),
        Llsd::Date(d) => out.push_str(&format!("d\"{}\"", d.to_iso_string())),
        Llsd::Uri(u) => out.push_str(&format!("l\"{}\"", u.as_str())),
        Llsd::Binary(b) => out.push_str(&format!("b64\"{}\"", base64_encode(b))),
        Llsd::Map(m) => {
            out.push('{');
            let mut first = true;
            for (k, v) in m {
                if !first { out.push(','); }
                first = false;
                out.push('\'');
                for c in k.chars() {
                    if c == '\'' || c == '\\' { out.push('\\'); }
                    out.push(c);
                }
                out.push_str("':");
                write_notation(out, v);
            }
            out.push('}');
        },
        Llsd::Array(a) => {
            out.push('[');
            for (i, v) in a.iter().enumerate() {
                if i > 0 { out.push(','); }
                write_notation(out, v);
            }
            out.push(']');
        },
    }
}

pub fn from_notation(text: &str) -> Llsd {
    let mut pos = 0;
    if text.starts_with(NOTATION_HEADER) {
        pos = NOTATION_HEADER.len();
    }
    parse_notation(text, &mut pos)
}

fn parse_notation(text: &str, pos: &mut usize) -> Llsd {
    skip_ws(text, pos);
    if *pos >= text.len() { return Llsd::Undefined; }
    let c = text.chars().nth(*pos).unwrap();
    match c {
        '!' => { *pos += 1; Llsd::Undefined },
        '1' | 't' | 'T' => {
            if text[*pos..].starts_with("true") || text[*pos..].starts_with("TRUE") { *pos += 4; }
            else { *pos += 1; }
            Llsd::Boolean(true)
        },
        '0' | 'f' | 'F' => {
            if text[*pos..].starts_with("false") || text[*pos..].starts_with("FALSE") { *pos += 5; }
            else { *pos += 1; }
            Llsd::Boolean(false)
        },
        'i' => {
            *pos += 1;
            let start = *pos;
            while *pos < text.len() && (text.as_bytes()[*pos].is_ascii_digit() || text.as_bytes()[*pos] == b'-') { *pos += 1; }
            Llsd::Integer(text[start..*pos].parse().unwrap_or(0))
        },
        'r' => {
            *pos += 1;
            let start = *pos;
            while *pos < text.len() && (text.as_bytes()[*pos].is_ascii_alphanumeric() || text.as_bytes()[*pos] == b'.' || text.as_bytes()[*pos] == b'-' || text.as_bytes()[*pos] == b'+') { *pos += 1; }
            let num = &text[start..*pos];
            if num == "nan" { Llsd::Real(f64::NAN) }
            else if num == "inf" || num == "+inf" { Llsd::Real(f64::INFINITY) }
            else if num == "-inf" { Llsd::Real(f64::NEG_INFINITY) }
            else { Llsd::Real(num.parse().unwrap_or(0.0)) }
        },
        '\'' | '"' => Llsd::String(parse_quoted(text, pos)),
        'u' => {
            *pos += 1;
            let end = (*pos + 36).min(text.len());
            let u_str = &text[*pos..end];
            *pos = end;
            Llsd::Uuid(LlUuid::from_string(u_str).unwrap_or(LlUuid::NULL))
        },
        'd' => { *pos += 1; Llsd::Date(LlDate::from_iso_string(&parse_quoted(text, pos)).unwrap_or(LlDate::NULL)) },
        'l' => { *pos += 1; Llsd::Uri(LlUri::new(&parse_quoted(text, pos))) },
        'b' => {
            if text[*pos..].starts_with("b64\"") || text[*pos..].starts_with("b64'") {
                *pos += 3;
                Llsd::Binary(base64_decode(&parse_quoted(text, pos)))
            } else { Llsd::Undefined }
        },
        '{' => {
            *pos += 1;
            let mut map = BTreeMap::new();
            while *pos < text.len() {
                skip_ws(text, pos);
                if *pos < text.len() && text.as_bytes()[*pos] == b'}' { *pos += 1; break; }
                let key = if *pos < text.len() && (text.as_bytes()[*pos] == b'\'' || text.as_bytes()[*pos] == b'"') { parse_quoted(text, pos) } else { String::new() };
                skip_ws(text, pos);
                if *pos < text.len() && text.as_bytes()[*pos] == b':' { *pos += 1; }
                skip_ws(text, pos);
                let val = parse_notation(text, pos);
                map.insert(key, val);
                skip_ws(text, pos);
                if *pos < text.len() && text.as_bytes()[*pos] == b',' { *pos += 1; }
            }
            Llsd::Map(map)
        },
        '[' => {
            *pos += 1;
            let mut arr = Vec::new();
            while *pos < text.len() {
                skip_ws(text, pos);
                if *pos < text.len() && text.as_bytes()[*pos] == b']' { *pos += 1; break; }
                arr.push(parse_notation(text, pos));
                skip_ws(text, pos);
                if *pos < text.len() && text.as_bytes()[*pos] == b',' { *pos += 1; }
            }
            Llsd::Array(arr)
        },
        _ => Llsd::Undefined,
    }
}

fn skip_ws(text: &str, pos: &mut usize) {
    while *pos < text.len() && text.as_bytes()[*pos].is_ascii_whitespace() { *pos += 1; }
}

fn parse_quoted(text: &str, pos: &mut usize) -> String {
    if *pos >= text.len() { return String::new(); }
    let q = text.as_bytes()[*pos];
    *pos += 1;
    let mut res = String::new();
    while *pos < text.len() && text.as_bytes()[*pos] != q {
        if text.as_bytes()[*pos] == b'\\' && *pos + 1 < text.len() {
            *pos += 1;
            res.push(text.chars().nth(*pos).unwrap());
        } else {
            res.push(text.chars().nth(*pos).unwrap());
        }
        *pos += 1;
    }
    if *pos < text.len() { *pos += 1; }
    res
}

pub fn to_json(sd: &Llsd) -> String { to_notation(sd) }
pub fn from_json(json: &str) -> Llsd { from_notation(json) }
