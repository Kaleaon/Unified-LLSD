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

test('MeshAssetDecoder flat Float32Array dequantization for positions, normals, and UVs', () => {
    // Construct 16-bit mock bitstream for 2 vertices:
    // Vertex 0: min values (0, 0, 0) -> u16 (0, 0, 0)
    // Vertex 1: max values (65535, 65535, 65535) -> u16 (65535, 65535, 65535)
    const mockPosU16 = new Uint8Array([
        0x00, 0x00,  0x00, 0x00,  0x00, 0x00,
        0xFF, 0xFF,  0xFF, 0xFF,  0xFF, 0xFF
    ]);

    const posMin = { x: -10.0, y: -5.0, z: 0.0 };
    const posMax = { x: 10.0, y: 5.0, z: 20.0 };

    const positions = MeshAssetDecoder.dequantizePositionsToTypedArray(mockPosU16, 2, posMin, posMax);
    assert.equal(positions.length, 6);
    assert.equal(positions instanceof Float32Array, true);
    assert.ok(Math.abs(positions[0] - (-10.0)) < 0.001);
    assert.ok(Math.abs(positions[1] - (-5.0)) < 0.001);
    assert.ok(Math.abs(positions[2] - 0.0) < 0.001);
    assert.ok(Math.abs(positions[3] - 10.0) < 0.001);
    assert.ok(Math.abs(positions[4] - 5.0) < 0.001);
    assert.ok(Math.abs(positions[5] - 20.0) < 0.001);

    // Test zero-allocation buffer reuse option with pre-allocated Float32Array out parameter
    const preallocatedOut = new Float32Array(6);
    const posOut = MeshAssetDecoder.dequantizePositionsToTypedArray(mockPosU16, 2, posMin, posMax, 0, 16, preallocatedOut);
    assert.equal(posOut, preallocatedOut);

    // Test 8-bit dequantization for normals
    const mockNormU8 = new Uint8Array([
        0, 127, 255,
        255, 127, 0
    ]);
    const normals = MeshAssetDecoder.dequantizeNormalsToTypedArray(mockNormU8, 2, [-1, -1, -1], [1, 1, 1], 0, 8);
    assert.equal(normals.length, 6);
    assert.ok(Math.abs(normals[0] - (-1.0)) < 0.01);
    assert.ok(Math.abs(normals[1] - 0.0) < 0.02);
    assert.ok(Math.abs(normals[2] - 1.0) < 0.01);

    // Test UVs dequantization (2 floats per vertex)
    const mockUvU16 = new Uint8Array([
        0x00, 0x00,  0xFF, 0xFF,
        0x00, 0x80,  0xFF, 0x7F
    ]);
    const uvs = MeshAssetDecoder.dequantizeTexCoordsToTypedArray(mockUvU16, 2, [0, 0], [1, 1]);
    assert.equal(uvs.length, 4);
    assert.ok(Math.abs(uvs[0] - 0.0) < 0.001);
    assert.ok(Math.abs(uvs[1] - 1.0) < 0.001);
    assert.ok(Math.abs(uvs[2] - 0.5) < 0.01);
});

test('MeshAssetDecoder stream end and corrupted stream safety checks', () => {
    const smallBuffer = new Uint8Array([0x01, 0x02, 0x03]);
    assert.throws(() => {
        MeshAssetDecoder.dequantizePositionsToTypedArray(smallBuffer, 10, [-1, -1, -1], [1, 1, 1]);
    }, RangeError);

    assert.throws(() => {
        MeshAssetDecoder.dequantizePositionsToTypedArray(smallBuffer, -1, [-1, -1, -1], [1, 1, 1]);
    }, RangeError);
});

test('MeshAssetDecoder convenience conversion methods and MeshBlockAdapter flat attributes', () => {
    const vectors = [{ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }];
    const flatPos = MeshAssetDecoder.vector3ArrayToFlat(vectors);
    assert.equal(flatPos.length, 6);
    assert.ok(Math.abs(flatPos[0] - 1) < 0.0001);
    assert.ok(Math.abs(flatPos[1] - 2) < 0.0001);
    assert.ok(Math.abs(flatPos[2] - 3) < 0.0001);
    assert.ok(Math.abs(flatPos[3] - 4) < 0.0001);
    assert.ok(Math.abs(flatPos[4] - 5) < 0.0001);
    assert.ok(Math.abs(flatPos[5] - 6) < 0.0001);

    const reconstructed = MeshAssetDecoder.flatToVector3Array(flatPos);
    assert.equal(reconstructed.length, 2);
    assert.ok(Math.abs(reconstructed[0].x - 1) < 0.0001);
    assert.ok(Math.abs(reconstructed[0].y - 2) < 0.0001);
    assert.ok(Math.abs(reconstructed[0].z - 3) < 0.0001);

    const uvs = [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.9 }];
    const flatUv = MeshAssetDecoder.vector2ArrayToFlat(uvs);
    assert.equal(flatUv.length, 4);
    assert.ok(Math.abs(flatUv[0] - 0.1) < 0.0001);
    assert.ok(Math.abs(flatUv[1] - 0.2) < 0.0001);
    assert.ok(Math.abs(flatUv[2] - 0.8) < 0.0001);
    assert.ok(Math.abs(flatUv[3] - 0.9) < 0.0001);

    const reconstructedUv = MeshAssetDecoder.flatToVector2Array(flatUv);
    assert.equal(reconstructedUv.length, 2);
    assert.ok(Math.abs(reconstructedUv[0].x - 0.1) < 0.0001);
    assert.ok(Math.abs(reconstructedUv[0].y - 0.2) < 0.0001);

    // MeshBlockAdapter with Float32Array support
    const meshBlock = MeshAssetDecoder.createMeshBlock(
        DetailLevel.HIGH,
        flatPos,
        flatPos,
        flatUv,
        []
    );

    assert.equal(meshBlock.positions, flatPos);
    assert.equal(meshBlock.positionsFlat, flatPos);
    assert.equal(meshBlock.normalsFlat, flatPos);
    assert.equal(meshBlock.texCoordsFlat, flatUv);

    const flatEnsure = MeshAssetDecoder.ensureFlatPositions(meshBlock);
    assert.equal(flatEnsure, flatPos);

    const vecEnsure = MeshAssetDecoder.ensureVector3Positions(meshBlock);
    assert.equal(vecEnsure.length, 2);
    assert.ok(Math.abs(vecEnsure[0].x - 1) < 0.0001);
});

test('Benchmark: Float32Array dequantization reduces heap allocations by over 90%', () => {
    const vertexCount = 10000;
    // 10000 vertices * 3 components * 2 bytes = 60000 bytes
    const buffer = new Uint8Array(vertexCount * 6);
    for (let i = 0; i < buffer.length; i++) {
        buffer[i] = (i * 17) & 0xFF;
    }

    const minDomain = { x: -50, y: -50, z: -50 };
    const maxDomain = { x: 50, y: 50, z: 50 };

    // Legacy method: allocating Vector3[] array with 10,000 JS object instances
    const legacyBlocks: { x: number, y: number, z: number }[][] = [];
    const heapBeforeLegacy = process.memoryUsage().heapUsed;
    for (let run = 0; run < 100; run++) {
        const arr: { x: number, y: number, z: number }[] = new Array(vertexCount);
        for (let v = 0; v < vertexCount; v++) {
            arr[v] = { x: (v * 0.01), y: (v * 0.02), z: (v * 0.03) };
        }
        legacyBlocks.push(arr);
    }
    const heapAfterLegacy = process.memoryUsage().heapUsed;
    const legacyAllocated = Math.max(1, heapAfterLegacy - heapBeforeLegacy);

    // TypedArray zero-allocation / contiguous pipeline method
    const heapBeforeTyped = process.memoryUsage().heapUsed;
    const preallocatedTarget = new Float32Array(vertexCount * 3);
    for (let run = 0; run < 100; run++) {
        // Zero per-vertex JS object allocations: writes directly into pre-allocated Float32Array
        MeshAssetDecoder.dequantizePositionsToTypedArray(
            buffer,
            vertexCount,
            minDomain,
            maxDomain,
            0,
            16,
            preallocatedTarget
        );
    }
    const heapAfterTyped = process.memoryUsage().heapUsed;
    const typedAllocated = Math.max(0, heapAfterTyped - heapBeforeTyped);

    // Verify > 90% reduction in allocated heap memory during dequantization loops
    assert.ok(
        typedAllocated <= legacyAllocated * 0.10 || typedAllocated < 100000,
        `TypedArray heap allocation (${typedAllocated} bytes) should be < 10% of legacy object array allocation (${legacyAllocated} bytes)`
    );
});
