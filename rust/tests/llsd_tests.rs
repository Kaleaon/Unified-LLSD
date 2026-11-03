use unified_llsd::{Llsd, LlUuid, LlDate, to_xml, from_xml, to_binary, from_binary, to_notation, from_notation, base64_decode, DECODE_TABLE};
use std::collections::BTreeMap;

#[test]
fn test_scalars_and_64bit_integer() {
    let big_int: i64 = 9223372036854775807;
    let sd = Llsd::Integer(big_int);
    assert_eq!(sd.as_i64(), big_int);
}

#[test]
fn test_xml_roundtrip() {
    let mut map = BTreeMap::new();
    map.insert("int".to_string(), Llsd::Integer(42));
    map.insert("str".to_string(), Llsd::String("hello".to_string()));
    map.insert("bool".to_string(), Llsd::Boolean(true));
    let sd = Llsd::Map(map);

    let xml = to_xml(&sd, true);
    let back = from_xml(&xml);

    assert_eq!(back["int"].as_i64(), 42);
    assert_eq!(back["str"].as_string(), "hello");
    assert_eq!(back["bool"].as_bool(), true);
}

#[test]
fn test_binary_roundtrip_and_endianness() {
    let mut map = BTreeMap::new();
    map.insert("int".to_string(), Llsd::Integer(12345));
    map.insert("date".to_string(), Llsd::Date(LlDate::new(123456789.0)));
    let sd = Llsd::Map(map);

    let bin = to_binary(&sd);
    let back = from_binary(&bin);

    assert_eq!(back["int"].as_i32(), 12345);
    assert!((back["date"].as_date().seconds_since_epoch - 123456789.0).abs() < 0.001);
}

#[test]
fn test_notation_roundtrip() {
    let mut map = BTreeMap::new();
    map.insert("str".to_string(), Llsd::String("notation test".to_string()));
    map.insert("uuid".to_string(), Llsd::Uuid(LlUuid::from_string("550e8400-e29b-41d4-a716-446655440000").unwrap()));
    let sd = Llsd::Map(map);

    let notation = to_notation(&sd);
    let back = from_notation(&notation);

    assert_eq!(back["str"].as_string(), "notation test");
    assert_eq!(back["uuid"].as_uuid().to_string(), "550e8400-e29b-41d4-a716-446655440000");
}

#[test]
fn test_base64_decode_valid_and_padding() {
    assert_eq!(base64_decode(""), b"");
    assert_eq!(base64_decode("Zg=="), b"f");
    assert_eq!(base64_decode("Zm8="), b"fo");
    assert_eq!(base64_decode("Zm9v"), b"foo");
    assert_eq!(base64_decode("Zm9vYmFy"), b"foobar");
    assert_eq!(base64_decode("SGVsbG8gV29ybGQ="), b"Hello World");
}

#[test]
fn test_base64_decode_whitespace_handling() {
    let ws_input = "  S G V \t s b G\r\n 8 = \n";
    assert_eq!(base64_decode(ws_input), b"Hello");
}

#[test]
fn test_base64_decode_missing_padding() {
    assert_eq!(base64_decode("Zg"), b"f");
    assert_eq!(base64_decode("Zm8"), b"fo");
    assert_eq!(base64_decode("SGVsbG8gV29ybGQ"), b"Hello World");
}

#[test]
fn test_base64_decode_invalid_ascii_and_non_ascii() {
    let invalid_ascii = "SG!V#sbG8=";
    assert_eq!(base64_decode(invalid_ascii), b"Hello");

    let non_ascii = "SG\u{0080}V\u{00FF}sbG8=";
    assert_eq!(base64_decode(non_ascii), b"Hello");
}

#[test]
fn test_base64_decode_xml_and_notation_roundtrips() {
    let binary_data = vec![0u8, 1, 2, 255, 254, 127, 128, 42];
    let sd = Llsd::Binary(binary_data.clone());

    let xml = to_xml(&sd, true);
    assert!(xml.contains("<binary encoding=\"base64\">"));
    let back_xml = from_xml(&xml);
    assert_eq!(back_xml.as_binary(), binary_data);

    let notation = to_notation(&sd);
    assert!(notation.contains("b64\""));
    let back_notation = from_notation(&notation);
    assert_eq!(back_notation.as_binary(), binary_data);
}

#[test]
fn test_decode_table_sentinels() {
    assert_eq!(DECODE_TABLE[b'A' as usize], 0);
    assert_eq!(DECODE_TABLE[b'Z' as usize], 25);
    assert_eq!(DECODE_TABLE[b'a' as usize], 26);
    assert_eq!(DECODE_TABLE[b'z' as usize], 51);
    assert_eq!(DECODE_TABLE[b'0' as usize], 52);
    assert_eq!(DECODE_TABLE[b'9' as usize], 61);
    assert_eq!(DECODE_TABLE[b'+' as usize], 62);
    assert_eq!(DECODE_TABLE[b'/' as usize], 63);
    assert_eq!(DECODE_TABLE[b' ' as usize], -1);
    assert_eq!(DECODE_TABLE[b'\t' as usize], -1);
    assert_eq!(DECODE_TABLE[b'=' as usize], -2);
    assert_eq!(DECODE_TABLE[b'!' as usize], -3);
    assert_eq!(DECODE_TABLE[128], -3);
    assert_eq!(DECODE_TABLE[255], -3);
}
