use unified_llsd::{Llsd, LlUuid, LlDate, LlUri, to_xml, from_xml, to_binary, from_binary, to_notation, from_notation, to_json, from_json};
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
fn test_xml_deeply_nested_containers() {
    let depth = 100;
    let mut xml = String::from("<?xml version=\"1.0\"?><llsd>");
    for _ in 0..depth {
        xml.push_str("<map><key>nested</key>");
    }
    xml.push_str("<integer>999</integer>");
    for _ in 0..depth {
        xml.push_str("</map>");
    }
    xml.push_str("</llsd>");

    let parsed = from_xml(&xml);
    let mut current = &parsed;
    for _ in 0..depth {
        current = &current["nested"];
    }
    assert_eq!(current.as_i64(), 999);
}

#[test]
fn test_xml_empty_containers_and_self_closing_scalars() {
    let xml = r#"<llsd>
        <map>
            <key>empty_map_self</key><map/>
            <key>empty_map_block</key><map></map>
            <key>empty_arr_self</key><array/>
            <key>empty_arr_block</key><array></array>
            <key>empty_str</key><string/>
            <key>undef_val</key><undef/>
        </map>
    </llsd>"#;

    let parsed = from_xml(xml);
    assert_eq!(parsed["empty_map_self"].len(), 0);
    assert!(matches!(parsed["empty_map_self"], Llsd::Map(_)));
    assert_eq!(parsed["empty_map_block"].len(), 0);
    assert!(matches!(parsed["empty_map_block"], Llsd::Map(_)));
    assert_eq!(parsed["empty_arr_self"].len(), 0);
    assert!(matches!(parsed["empty_arr_self"], Llsd::Array(_)));
    assert_eq!(parsed["empty_arr_block"].len(), 0);
    assert!(matches!(parsed["empty_arr_block"], Llsd::Array(_)));
    assert_eq!(parsed["empty_str"].as_string(), "");
    assert!(matches!(parsed["undef_val"], Llsd::Undefined));
}

#[test]
fn test_xml_comments_and_processing_instructions() {
    let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
    <!-- Pre-LLSD Comment -->
    <llsd>
        <!-- Map Comment -->
        <map>
            <?pi_test instruction?>
            <key>value</key>
            <!-- Key-Value Comment -->
            <string>hello world</string>
        </map>
    </llsd>
    <!-- Post-LLSD Comment -->"#;

    let parsed = from_xml(xml);
    assert_eq!(parsed["value"].as_string(), "hello world");
}

#[test]
fn test_xml_malformed_input_graceful_handling() {
    // Missing closing map tag
    let xml1 = "<llsd><map><key>a</key><integer>123</integer>";
    let parsed1 = from_xml(xml1);
    assert_eq!(parsed1["a"].as_i64(), 123);

    // Empty XML string
    let parsed2 = from_xml("");
    assert!(matches!(parsed2, Llsd::Undefined));

    // Garbage / unclosed tags
    let xml3 = "<llsd><map><key>a</key><unclosed_tag";
    let parsed3 = from_xml(xml3);
    assert!(parsed3["a"].is_undefined());
}

#[test]
fn test_native_json_roundtrip() {
    let mut map = BTreeMap::new();
    map.insert("null_val".to_string(), Llsd::Undefined);
    map.insert("bool_true".to_string(), Llsd::Boolean(true));
    map.insert("bool_false".to_string(), Llsd::Boolean(false));
    map.insert("int_val".to_string(), Llsd::Integer(9223372036854775807));
    map.insert("real_val".to_string(), Llsd::Real(3.14159));
    map.insert("str_val".to_string(), Llsd::String("hello \"world\"\n\t\\".to_string()));
    map.insert("uuid_val".to_string(), Llsd::Uuid(LlUuid::from_string("550e8400-e29b-41d4-a716-446655440000").unwrap()));
    map.insert("uri_val".to_string(), Llsd::Uri(LlUri::new("http://example.com")));
    map.insert("bin_val".to_string(), Llsd::Binary(vec![1, 2, 3, 4]));

    let mut arr = Vec::new();
    arr.push(Llsd::Integer(1));
    arr.push(Llsd::String("item".to_string()));
    map.insert("array_val".to_string(), Llsd::Array(arr));

    let sd = Llsd::Map(map);

    let json_str = to_json(&sd);
    assert!(json_str.starts_with('{'));
    assert!(json_str.ends_with('}'));

    let back = from_json(&json_str);
    assert_eq!(back["null_val"].is_undefined(), true);
    assert_eq!(back["bool_true"].as_bool(), true);
    assert_eq!(back["bool_false"].as_bool(), false);
    assert_eq!(back["int_val"].as_i64(), 9223372036854775807);
    assert!((back["real_val"].as_f64() - 3.14159).abs() < 0.00001);
    assert_eq!(back["str_val"].as_string(), "hello \"world\"\n\t\\");
    assert_eq!(back["uuid_val"].as_string(), "550e8400-e29b-41d4-a716-446655440000");
    assert_eq!(back["uri_val"].as_string(), "http://example.com");
    assert_eq!(back["array_val"].len(), 2);
    assert_eq!(back["array_val"][0].as_i64(), 1);
    assert_eq!(back["array_val"][1].as_string(), "item");
}

#[cfg(feature = "serde")]
#[test]
fn test_serde_json_parity() {
    let mut map = BTreeMap::new();
    map.insert("bool".to_string(), Llsd::Boolean(true));
    map.insert("int".to_string(), Llsd::Integer(12345));
    map.insert("real".to_string(), Llsd::Real(2.71828));
    map.insert("str".to_string(), Llsd::String("serde parity test".to_string()));
    map.insert("uuid".to_string(), Llsd::Uuid(LlUuid::from_string("550e8400-e29b-41d4-a716-446655440000").unwrap()));
    map.insert("undef".to_string(), Llsd::Undefined);

    let mut arr = Vec::new();
    arr.push(Llsd::Boolean(false));
    arr.push(Llsd::Integer(42));
    map.insert("arr".to_string(), Llsd::Array(arr));

    let sd = Llsd::Map(map);

    let native_json = to_json(&sd);
    let serde_json = serde_json::to_string(&sd).expect("serde_json::to_string failed");

    // Guarantee that native to_json and serde_json::to_string output identical payloads
    assert_eq!(native_json, serde_json);

    // Guarantee that deserializing with serde_json yields equivalent Llsd structure
    let serde_back: Llsd = serde_json::from_str(&native_json).expect("serde_json::from_str failed");
    let native_back = from_json(&serde_json);

    assert_eq!(serde_back, native_back);
    assert_eq!(serde_back["int"].as_i64(), 12345);
    assert_eq!(serde_back["str"].as_string(), "serde parity test");
    assert_eq!(serde_back["bool"].as_bool(), true);
    assert_eq!(serde_back["arr"][1].as_i64(), 42);
}
