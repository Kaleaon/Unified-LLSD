use unified_llsd::{Llsd, LlUuid, LlDate, to_xml, from_xml, to_binary, from_binary, to_notation, from_notation};
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
    assert!(back["bool"].as_bool());
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
