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

test('LLSD XML Hoisted Regex and Nested Structure Parsing', () => {
    // Verify static regex constants
    assert.ok(LLSDSerialize.LLSD_WRAPPER_REGEX instanceof RegExp);
    assert.ok(LLSDSerialize.LLSD_TAG_REGEX instanceof RegExp);
    assert.equal(LLSDSerialize.LLSD_TAG_REGEX.global, true);

    // Deeply nested XML map and array nodes
    const nestedXml = `<?xml version="1.0" encoding="UTF-8"?>
<llsd>
  <map>
    <key>nested_map</key>
    <map>
      <key>level2</key>
      <map>
        <key>level3_key</key>
        <string>level3_val</string>
        <key>undef_val</key>
        <undef/>
      </map>
    </map>
    <key>nested_array</key>
    <array>
      <integer>100</integer>
      <map>
        <key>item_key</key>
        <boolean>true</boolean>
      </map>
      <array>
        <real>3.14159</real>
        <uuid>d7b322a4-e918-4a57-bf29-1d2a13f019a2</uuid>
      </array>
    </array>
  </map>
</llsd>`;

    const parsed = LLSDSerialize.fromXML(nestedXml);
    assert.equal(parsed.get('nested_map').get('level2').get('level3_key').asString(), 'level3_val');
    assert.equal(parsed.get('nested_map').get('level2').get('undef_val').isUndefined(), true);

    const arr = parsed.get('nested_array').asArray;
    assert.equal(arr.length, 3);
    assert.equal(arr[0].asInteger(), 100);
    assert.equal(arr[1].get('item_key').asBoolean(), true);

    const subArr = arr[2].asArray;
    assert.equal(subArr.length, 2);
    assert.ok(Math.abs(subArr[0].asReal() - 3.14159) < 0.0001);
    assert.equal(subArr[1].asUUID().toString(), 'd7b322a4-e918-4a57-bf29-1d2a13f019a2');

    // XML without root <llsd> wrapper
    const unwrappedXml = `<map><key>status</key><string>ok</string></map>`;
    // Mutate lastIndex to verify resilience against state pollution
    LLSDSerialize.LLSD_TAG_REGEX.lastIndex = 50;
    const unwrappedParsed = LLSDSerialize.fromXML(unwrappedXml);
    assert.equal(unwrappedParsed.get('status').asString(), 'ok');
});
