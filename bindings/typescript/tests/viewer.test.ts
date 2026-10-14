import test from 'node:test';
import assert from 'node:assert/strict';

import {
    AlphaMode,
    DetailLevel,
    AssetSchemaConstants,
    TextureTransformAdapter,
    LLSDValue,
    LLSDType,
    LLUUID,
    LLSDDate,
    LLSDURI,
    LLSDBinary,
    LLSDSerialize,
    MeshAssetDecoder
} from '../index.js';

test('AssetSchemaAdapter constants and LOD mapping', () => {
    assert.equal(AssetSchemaConstants.MAX_RIGGED_MESH_JOINTS, 256);
    assert.equal(AssetSchemaConstants.JOINT_SENTINEL, 0xFF);

    assert.equal(AssetSchemaConstants.getLodKey(DetailLevel.HIGHEST), 'high_lod');
    assert.equal(AssetSchemaConstants.getLodKey(DetailLevel.HIGH), 'high_lod');
    assert.equal(AssetSchemaConstants.getLodKey(DetailLevel.MEDIUM), 'medium_lod');
    assert.equal(AssetSchemaConstants.getLodKey(DetailLevel.LOW), 'low_lod');
    assert.equal(AssetSchemaConstants.getLodKey(DetailLevel.LOWEST), 'lowest_lod');
});

test('TextureTransformAdapter Float32Array packing', () => {
    const transform = new TextureTransformAdapter(2.0, 3.0, 1.5707963, 0.5, 0.25);

    const packed = transform.getPacked();
    assert.equal(packed.length, 8);
    assert.equal(packed[0], 2.0);
    assert.equal(packed[1], 3.0);
    assert.ok(Math.abs(packed[2] - 1.5707963) < 0.0001);
    assert.equal(packed[3], 0.0);
    assert.equal(packed[4], 0.5);
    assert.equal(packed[5], 0.25);
    assert.equal(packed[6], 0.0);
    assert.equal(packed[7], 0.0);

    const tight = transform.getPackedTight();
    assert.equal(tight.length, 5);
    assert.equal(tight[0], 2.0);
    assert.equal(tight[1], 3.0);
    assert.ok(Math.abs(tight[2] - 1.5707963) < 0.0001);
    assert.equal(tight[3], 0.5);
    assert.equal(tight[4], 0.25);
});

test('LLSD Value Types and Conversions', () => {
    const uuidStr = '12345678-1234-1234-1234-123456789abc';
    const uuidVal = LLSDValue.uuid(uuidStr);
    assert.equal(uuidVal.asUUID().toString(), uuidStr);

    const mapVal = LLSDValue.map({
        active: LLSDValue.boolean(true),
        count: LLSDValue.integer(42),
        name: LLSDValue.string('Avatar')
    });

    assert.equal(mapVal.get('active').asBoolean(), true);
    assert.equal(mapVal.get('count').asInteger(), 42);
    assert.equal(mapVal.get('name').asString(), 'Avatar');
    assert.equal(mapVal.get('nonexistent').isUndefined(), true);
});

test('LLSD Multi-Format Serialization & Auto-Detect', () => {
    const original = LLSDValue.map({
        agent_id: LLSDValue.uuid('00000000-0000-0000-0000-000000000001'),
        name: LLSDValue.string('Second Life User'),
        balance: LLSDValue.integer(250)
    });

    // Notation
    const notationStr = LLSDSerialize.toNotation(original);
    const parsedNotation = LLSDSerialize.fromNotation(notationStr);
    assert.equal(parsedNotation.get('name').asString(), 'Second Life User');

    // Binary
    const binaryData = LLSDSerialize.toBinary(original);
    const parsedBinary = LLSDSerialize.fromBinary(binaryData);
    assert.equal(parsedBinary.get('name').asString(), 'Second Life User');
    assert.equal(parsedBinary.get('balance').asInteger(), 250);

    // XML
    const xmlStr = LLSDSerialize.toXML(original);
    const parsedXML = LLSDSerialize.fromXML(xmlStr);
    assert.equal(parsedXML.get('name').asString(), 'Second Life User');

    // Auto Detect Binary
    const autoParsed = LLSDSerialize.parse(binaryData);
    assert.equal(autoParsed.get('balance').asInteger(), 250);
});

test('LLSD Two-Pass Direct Single-Buffer Binary Encoding', () => {
    const uuidStr = '12345678-1234-1234-1234-123456789abc';
    const uriStr = 'https://secondlife.com/api';
    const testDate = new LLSDDate('2026-10-14T10:00:00Z');

    const complex = LLSDValue.map({
        flag_true: LLSDValue.boolean(true),
        flag_false: LLSDValue.boolean(false),
        num_int: LLSDValue.integer(123456),
        num_real: LLSDValue.real(3.1415926535),
        uuid_val: LLSDValue.uuid(uuidStr),
        date_val: LLSDValue.date(testDate),
        uri_val: LLSDValue.uri(uriStr),
        unicode_str: LLSDValue.string('Avatar 世界 😀'),
        empty_map: LLSDValue.map({}),
        empty_arr: LLSDValue.array([]),
        item_list: LLSDValue.array([
            LLSDValue.integer(1),
            LLSDValue.string('nested'),
            LLSDValue.boolean(true)
        ])
    });

    const bodySize = LLSDSerialize.calculateBinarySize(complex);
    const binaryBytes = LLSDSerialize.toBinary(complex);

    // Header length is 16 ("<?llsd/binary?>\n")
    assert.equal(binaryBytes.length, 16 + bodySize);

    // Verify roundtrip deserialization
    const decoded = LLSDSerialize.fromBinary(binaryBytes);
    assert.equal(decoded.get('flag_true').asBoolean(), true);
    assert.equal(decoded.get('flag_false').asBoolean(), false);
    assert.equal(decoded.get('num_int').asInteger(), 123456);
    assert.ok(Math.abs(decoded.get('num_real').asReal() - 3.1415926535) < 0.000001);
    assert.equal(decoded.get('uuid_val').asUUID().toString(), uuidStr);
    assert.ok(Math.abs(decoded.get('date_val').asDate().getSecondsSinceEpoch() - testDate.getSecondsSinceEpoch()) < 0.001);
    assert.equal(decoded.get('uri_val').asURI().toString(), uriStr);
    assert.equal(decoded.get('unicode_str').asString(), 'Avatar 世界 😀');
    assert.equal(decoded.get('empty_map').asMap.size, 0);
    assert.equal(decoded.get('empty_arr').asArray.length, 0);

    const arr = decoded.get('item_list').asArray;
    assert.equal(arr.length, 3);
    assert.equal(arr[0].asInteger(), 1);
    assert.equal(arr[1].asString(), 'nested');
    assert.equal(arr[2].asBoolean(), true);
});

test('MeshAssetDecoder Joint Influence Parsing and Sentinel Support', () => {
    // Construct mock binary joint influence buffer with extended skeleton joint (>163) and 0xFF sentinel
    const mockBuffer = new Uint8Array([
        0, 0, 128,   // Joint 0, weight ~0.5 (128/255 -> 0.5)
        165, 0, 255, // Joint 165 (extended skeleton joint > 163), weight ~1.0
        0xFF         // Sentinel end of list
    ]);

    const result = MeshAssetDecoder.parseJointInfluences(mockBuffer);
    assert.equal(result.jointInfluences.length, 2);
    assert.equal(result.jointInfluences[0].jointIndex, 0);
    assert.equal(result.jointInfluences[1].jointIndex, 165); // Successfully parsed joint 165!
    assert.ok(Math.abs(result.jointInfluences[1].weight - 1.0) < 0.01);
});
