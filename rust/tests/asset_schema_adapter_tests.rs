use unified_llsd::*;

#[test]
fn test_rust_asset_schema_adapter_constants_and_enums() {
    assert_eq!(MAX_RIGGED_MESH_JOINTS, 256);
    assert_eq!(JOINT_SENTINEL, 0xFF);

    assert_eq!(AlphaMode::Opaque as u8, 0);
    assert_eq!(AlphaMode::Mask as u8, 1);
    assert_eq!(AlphaMode::Blend as u8, 2);

    assert_eq!(DetailLevel::Highest as u8, 0);
    assert_eq!(DetailLevel::High as u8, 1);
    assert_eq!(DetailLevel::Medium as u8, 2);
    assert_eq!(DetailLevel::Low as u8, 3);
    assert_eq!(DetailLevel::Lowest as u8, 4);

    assert_eq!(get_lod_key(DetailLevel::Highest), "high_lod");
    assert_eq!(get_lod_key(DetailLevel::High), "high_lod");
    assert_eq!(get_lod_key(DetailLevel::Medium), "medium_lod");
    assert_eq!(get_lod_key(DetailLevel::Low), "low_lod");
    assert_eq!(get_lod_key(DetailLevel::Lowest), "lowest_lod");
    assert_eq!(getLodKey(DetailLevel::High), "high_lod");
}

#[test]
fn test_rust_texture_transform_adapter_packing() {
    let xform = TextureTransformAdapter::new(2.0, 3.0, 1.5707963, 0.5, 0.25);

    let packed = xform.get_packed();
    assert_eq!(packed.len(), 8);
    assert_eq!(packed[0], 2.0);
    assert_eq!(packed[1], 3.0);
    assert_eq!(packed[2], 1.5707963);
    assert_eq!(packed[3], 0.0);
    assert_eq!(packed[4], 0.5);
    assert_eq!(packed[5], 0.25);
    assert_eq!(packed[6], 0.0);
    assert_eq!(packed[7], 0.0);

    let packed_tight = xform.get_packed_tight();
    assert_eq!(packed_tight.len(), 5);
    assert_eq!(packed_tight[0], 2.0);
    assert_eq!(packed_tight[1], 3.0);
    assert_eq!(packed_tight[2], 1.5707963);
    assert_eq!(packed_tight[3], 0.5);
    assert_eq!(packed_tight[4], 0.25);

    assert_eq!(xform.getPacked(), packed);
    assert_eq!(xform.getPackedTight(), packed_tight);
}
