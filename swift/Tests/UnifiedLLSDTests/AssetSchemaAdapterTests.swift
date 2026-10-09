import XCTest
@testable import UnifiedLLSD

final class AssetSchemaAdapterTests: XCTestCase {
    func testAssetSchemaConstantsAndEnums() {
        XCTAssertEqual(MAX_RIGGED_MESH_JOINTS, 256)
        XCTAssertEqual(JOINT_SENTINEL, 0xFF)
        XCTAssertEqual(AssetSchemaConstants.MAX_RIGGED_MESH_JOINTS, 256)
        XCTAssertEqual(AssetSchemaConstants.JOINT_SENTINEL, 0xFF)

        XCTAssertEqual(AlphaMode.opaque.rawValue, 0)
        XCTAssertEqual(AlphaMode.mask.rawValue, 1)
        XCTAssertEqual(AlphaMode.blend.rawValue, 2)

        XCTAssertEqual(DetailLevel.highest.rawValue, 0)
        XCTAssertEqual(DetailLevel.high.rawValue, 1)
        XCTAssertEqual(DetailLevel.medium.rawValue, 2)
        XCTAssertEqual(DetailLevel.low.rawValue, 3)
        XCTAssertEqual(DetailLevel.lowest.rawValue, 4)

        XCTAssertEqual(getLodKey(.highest), "high_lod")
        XCTAssertEqual(getLodKey(.high), "high_lod")
        XCTAssertEqual(getLodKey(.medium), "medium_lod")
        XCTAssertEqual(getLodKey(.low), "low_lod")
        XCTAssertEqual(getLodKey(.lowest), "lowest_lod")
        XCTAssertEqual(get_lod_key(.high), "high_lod")
        XCTAssertEqual(AssetSchemaConstants.getLodKey(.high), "high_lod")
    }

    func testTextureTransformAdapterPacking() {
        let xform = TextureTransformAdapter(
            scaleX: 2.0,
            scaleY: 3.0,
            rotation: 1.5707963,
            offsetX: 0.5,
            offsetY: 0.25
        )

        let packed = xform.getPacked()
        XCTAssertEqual(packed.count, 8)
        XCTAssertEqual(packed[0], 2.0)
        XCTAssertEqual(packed[1], 3.0)
        XCTAssertEqual(packed[2], 1.5707963)
        XCTAssertEqual(packed[3], 0.0)
        XCTAssertEqual(packed[4], 0.5)
        XCTAssertEqual(packed[5], 0.25)
        XCTAssertEqual(packed[6], 0.0)
        XCTAssertEqual(packed[7], 0.0)

        let packedTight = xform.getPackedTight()
        XCTAssertEqual(packedTight.count, 5)
        XCTAssertEqual(packedTight[0], 2.0)
        XCTAssertEqual(packedTight[1], 3.0)
        XCTAssertEqual(packedTight[2], 1.5707963)
        XCTAssertEqual(packedTight[3], 0.5)
        XCTAssertEqual(packedTight[4], 0.25)

        XCTAssertEqual(xform.get_packed(), packed)
        XCTAssertEqual(xform.get_packed_tight(), packedTight)
    }
}
