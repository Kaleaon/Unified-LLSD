import 'package:test/test.dart';
import '../lib/llsd.dart';
import '../lib/asset_schema_adapter.dart';

void main() {
  test('Dart asset schema adapter constants and enums', () {
    expect(MAX_RIGGED_MESH_JOINTS, equals(256));
    expect(JOINT_SENTINEL, equals(0xFF));
    expect(AssetSchemaConstants.maxRiggedMeshJoints, equals(256));
    expect(AssetSchemaConstants.jointSentinel, equals(0xFF));

    expect(AlphaMode.opaque.index, equals(0));
    expect(AlphaMode.mask.index, equals(1));
    expect(AlphaMode.blend.index, equals(2));

    expect(DetailLevel.highest.index, equals(0));
    expect(DetailLevel.high.index, equals(1));
    expect(DetailLevel.medium.index, equals(2));
    expect(DetailLevel.low.index, equals(3));
    expect(DetailLevel.lowest.index, equals(4));

    expect(getLodKey(DetailLevel.highest), equals('high_lod'));
    expect(getLodKey(DetailLevel.high), equals('high_lod'));
    expect(getLodKey(DetailLevel.medium), equals('medium_lod'));
    expect(getLodKey(DetailLevel.low), equals('low_lod'));
    expect(getLodKey(DetailLevel.lowest), equals('lowest_lod'));
    expect(get_lod_key(DetailLevel.high), equals('high_lod'));
    expect(AssetSchemaConstants.getLodKey(DetailLevel.high), equals('high_lod'));
  });

  test('Dart texture transform adapter packing', () {
    final xform = TextureTransformAdapter(
      scaleX: 2.0,
      scaleY: 3.0,
      rotation: 1.5707963,
      offsetX: 0.5,
      offsetY: 0.25,
    );

    final packed = xform.getPacked();
    expect(packed.length, equals(8));
    expect(packed[0], equals(2.0));
    expect(packed[1], equals(3.0));
    expect(packed[2], equals(1.5707963));
    expect(packed[3], equals(0.0));
    expect(packed[4], equals(0.5));
    expect(packed[5], equals(0.25));
    expect(packed[6], equals(0.0));
    expect(packed[7], equals(0.0));

    final packedTight = xform.getPackedTight();
    expect(packedTight.length, equals(5));
    expect(packedTight[0], equals(2.0));
    expect(packedTight[1], equals(3.0));
    expect(packedTight[2], equals(1.5707963));
    expect(packedTight[3], equals(0.5));
    expect(packedTight[4], equals(0.25));

    expect(xform.get_packed(), equals(packed));
    expect(xform.get_packed_tight(), equals(packedTight));
  });
}
