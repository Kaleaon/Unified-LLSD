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
    MeshAssetDecoder,
    PBREngine,
    CanvasViewport
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

test('PBREngine Texture Matrix and Uniform Generation', () => {
    const matrix = PBREngine.createTextureTransformMatrix(2.0, 2.0, 0, 0.1, 0.2);
    assert.equal(matrix.length, 9);
    assert.ok(Math.abs(matrix[0] - 2.0) < 0.0001);
    assert.ok(Math.abs(matrix[2] - 0.1) < 0.0001);
    assert.ok(Math.abs(matrix[5] - 0.2) < 0.0001);

    const material = PBREngine.parseGLTFMaterial({
        alphaMode: 'BLEND',
        alphaCutoff: 0.75,
        doubleSided: true,
        transforms: [{ scaleX: 1.5, scaleY: 1.5 }]
    });

    assert.equal(material.alphaMode, AlphaMode.BLEND);
    assert.equal(material.alphaCutoff, 0.75);
    assert.equal(material.doubleSided, true);
    assert.equal(material.transforms.length, 1);
    assert.equal(material.transforms[0].scaleX, 1.5);
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
    const mockBuffer = new Uint8Array([
        0, 0, 128,   // Joint 0, weight ~0.5
        165, 0, 255, // Joint 165 (extended skeleton > 163), weight ~1.0
        254, 0, 255, // Joint 254 (max joint index before sentinel), weight ~1.0
        0xFF         // Sentinel 0xFF (255) end of list
    ]);

    const result = MeshAssetDecoder.parseJointInfluences(mockBuffer);
    assert.equal(result.jointInfluences.length, 3);
    assert.equal(result.jointInfluences[0].jointIndex, 0);
    assert.equal(result.jointInfluences[1].jointIndex, 165);
    assert.equal(result.jointInfluences[2].jointIndex, 254);
});

test('MeshAssetDecoder Binary Decompression and Sub-5ms Performance', () => {
    const vertexCount = 100;
    const indexCount = 300;
    // Header (4 bytes) + Pos (100*6) + Norm (100*6) + UV (100*4) + Idx (300*2) + Joint (3 bytes)
    const totalSize = 4 + (vertexCount * 6) + (vertexCount * 6) + (vertexCount * 4) + (indexCount * 2) + 3;
    const buffer = new Uint8Array(totalSize);
    const view = new DataView(buffer.buffer);

    let cur = 0;
    view.setUint16(cur, vertexCount, true); cur += 2;
    view.setUint16(cur, indexCount, true); cur += 2;

    // Fill mock 16-bit positions
    for (let i = 0; i < vertexCount * 3; i++) {
        view.setUint16(cur, 32768, true); cur += 2; // Midpoint
    }
    // Fill mock 16-bit normals
    for (let i = 0; i < vertexCount * 3; i++) {
        view.setUint16(cur, 65535, true); cur += 2; // +1.0
    }
    // Fill mock 16-bit UVs
    for (let i = 0; i < vertexCount * 2; i++) {
        view.setUint16(cur, 0, true); cur += 2; // 0.0
    }
    // Fill mock indices
    for (let i = 0; i < indexCount; i++) {
        view.setUint16(cur, i % vertexCount, true); cur += 2;
    }
    // Joint influence
    buffer[cur++] = 10;
    buffer[cur++] = 0;
    buffer[cur++] = 255;

    const startTime = performance.now();
    const decodedBlock = MeshAssetDecoder.decompressMeshBlock(buffer, DetailLevel.HIGHEST);
    const elapsedMs = performance.now() - startTime;

    assert.ok(elapsedMs < 5.0, `Decompression should execute in < 5ms, took ${elapsedMs}ms`);
    assert.equal(decodedBlock.positions.length, 100);
    assert.equal(decodedBlock.normals.length, 100);
    assert.equal(decodedBlock.texCoords.length, 100);
    assert.equal(decodedBlock.indices?.length, 300);
    assert.ok(Math.abs(decodedBlock.positions[0].x - 0.0) < 0.01); // Midpoint of [-0.5, 0.5] is 0
    assert.ok(Math.abs(decodedBlock.normals[0].x - 1.0) < 0.01);
});

test('MeshAssetDecoder Vendor Extension Rejection', () => {
    assert.throws(() => {
        MeshAssetDecoder.validateAssetData({
            high_lod: {},
            vendor_extension_data: { custom: true }
        });
    }, /Rejected non-standard vendor extension/);

    assert.throws(() => {
        MeshAssetDecoder.validateAssetData({
            ext_unsupported_mesh: {}
        });
    }, /Rejected non-standard vendor extension/);
});

test('CanvasViewport Plugin Context Setup, Dynamic LOD, and Lifecycle', () => {
    const mockCanvas = {
        width: 800,
        height: 600,
        getContext: (type: string) => null // Forces fallback mock GL context
    };

    const viewport = new CanvasViewport({ canvas: mockCanvas });
    assert.equal(viewport.isReady(), true);
    assert.equal(viewport.isMockContext(), true);

    const highBlock = MeshAssetDecoder.createMeshBlock(DetailLevel.HIGHEST, [], [], [], []);
    const medBlock = MeshAssetDecoder.createMeshBlock(DetailLevel.MEDIUM, [], [], [], []);
    const lowBlock = MeshAssetDecoder.createMeshBlock(DetailLevel.LOW, [], [], [], []);
    const lowestBlock = MeshAssetDecoder.createMeshBlock(DetailLevel.LOWEST, [], [], [], []);

    viewport.setMeshBlock(highBlock);
    viewport.setMeshBlock(medBlock);
    viewport.setMeshBlock(lowBlock);
    viewport.setMeshBlock(lowestBlock);

    // Test dynamic LOD switching based on camera distance
    assert.equal(viewport.updateCameraDistance(2.0), DetailLevel.HIGHEST);
    assert.equal(viewport.updateCameraDistance(10.0), DetailLevel.MEDIUM);
    assert.equal(viewport.updateCameraDistance(20.0), DetailLevel.LOW);
    assert.equal(viewport.updateCameraDistance(40.0), DetailLevel.LOWEST);

    // Test frame rendering and loop
    viewport.renderFrame();

    let callbackCalled = false;
    viewport.startAnimationLoop((fps) => {
        callbackCalled = true;
        assert.equal(fps, 60);
    });
    assert.equal(callbackCalled, true);
    viewport.stopAnimationLoop();

    // Clean disposal
    viewport.dispose();
    assert.equal(viewport.isReady(), false);
});
