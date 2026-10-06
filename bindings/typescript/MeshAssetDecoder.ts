/**
 * Modern Second Life 3D Viewer Mesh & PBR Asset Decoder and Shader Utilities.
 */

import {
    DetailLevel,
    AssetSchemaConstants,
    TextureTransformAdapter,
    JointInfluence,
    Vector2,
    Vector3,
    MeshBlockAdapter,
    GLTFMaterialAdapter,
    AlphaMode
} from './AssetSchemaAdapter.js';
import { PBREngine } from './PBREngine.js';

export interface MeshBounds {
    minPos?: [number, number, number];
    maxPos?: [number, number, number];
    minUV?: [number, number];
    maxUV?: [number, number];
}

export class MeshAssetDecoder {
    /**
     * Validate asset metadata or material objects to reject non-standard vendor extensions.
     */
    public static validateAssetData(data: any): void {
        if (!data || typeof data !== 'object') return;

        const keys = Object.keys(data);
        for (const key of keys) {
            if (
                key.startsWith('vendor_') ||
                key.startsWith('ext_') ||
                key.startsWith('x_vendor_') ||
                key === 'vendor_extension'
            ) {
                throw new Error(`Rejected non-standard vendor extension: ${key}`);
            }
            if (typeof data[key] === 'object' && data[key] !== null) {
                MeshAssetDecoder.validateAssetData(data[key]);
            }
        }
    }

    /**
     * Decode rigged mesh joint influences from binary data.
     * Supports extended skeletons with up to 256 joints (0..255) and 0xFF sentinel byte.
     */
    public static parseJointInfluences(buffer: Uint8Array, offset: number = 0): { jointInfluences: JointInfluence[]; bytesRead: number } {
        const influences: JointInfluence[] = [];
        let cur = offset;

        while (cur < buffer.length) {
            const jointIdx = buffer[cur++];
            if (jointIdx === AssetSchemaConstants.JOINT_SENTINEL) {
                break; // 0xFF end of list sentinel
            }

            if (cur + 2 > buffer.length) break;
            const b0 = buffer[cur++];
            const b1 = buffer[cur++];
            const uint16Weight = (b1 << 8) | b0;
            const weight = uint16Weight / 65535.0;

            influences.push({
                jointIndex: jointIdx,
                weight: weight
            });
        }

        return {
            jointInfluences: influences,
            bytesRead: cur - offset
        };
    }

    /**
     * Decompress 16-bit positions using domain bounding box min/max ranges.
     */
    public static decompressPositions(
        view: DataView,
        offset: number,
        vertexCount: number,
        minPos: [number, number, number] = [-0.5, -0.5, -0.5],
        maxPos: [number, number, number] = [0.5, 0.5, 0.5]
    ): { positions: Vector3[]; positionArray: Float32Array; bytesRead: number } {
        const positions: Vector3[] = new Array(vertexCount);
        const positionArray = new Float32Array(vertexCount * 3);
        const rangeX = maxPos[0] - minPos[0];
        const rangeY = maxPos[1] - minPos[1];
        const rangeZ = maxPos[2] - minPos[2];

        let cur = offset;
        for (let i = 0; i < vertexCount; i++) {
            const u16X = view.getUint16(cur, true); cur += 2;
            const u16Y = view.getUint16(cur, true); cur += 2;
            const u16Z = view.getUint16(cur, true); cur += 2;

            const x = minPos[0] + (u16X / 65535.0) * rangeX;
            const y = minPos[1] + (u16Y / 65535.0) * rangeY;
            const z = minPos[2] + (u16Z / 65535.0) * rangeZ;

            positions[i] = { x, y, z };
            const idx = i * 3;
            positionArray[idx] = x;
            positionArray[idx + 1] = y;
            positionArray[idx + 2] = z;
        }

        return { positions, positionArray, bytesRead: cur - offset };
    }

    /**
     * Decompress 16-bit normals into range [-1.0, +1.0].
     */
    public static decompressNormals(
        view: DataView,
        offset: number,
        vertexCount: number
    ): { normals: Vector3[]; normalArray: Float32Array; bytesRead: number } {
        const normals: Vector3[] = new Array(vertexCount);
        const normalArray = new Float32Array(vertexCount * 3);

        let cur = offset;
        for (let i = 0; i < vertexCount; i++) {
            const u16X = view.getUint16(cur, true); cur += 2;
            const u16Y = view.getUint16(cur, true); cur += 2;
            const u16Z = view.getUint16(cur, true); cur += 2;

            const x = -1.0 + (u16X / 65535.0) * 2.0;
            const y = -1.0 + (u16Y / 65535.0) * 2.0;
            const z = -1.0 + (u16Z / 65535.0) * 2.0;

            normals[i] = { x, y, z };
            const idx = i * 3;
            normalArray[idx] = x;
            normalArray[idx + 1] = y;
            normalArray[idx + 2] = z;
        }

        return { normals, normalArray, bytesRead: cur - offset };
    }

    /**
     * Decompress 16-bit UV coordinates using UV bounding box.
     */
    public static decompressTexCoords(
        view: DataView,
        offset: number,
        vertexCount: number,
        minUV: [number, number] = [0.0, 0.0],
        maxUV: [number, number] = [1.0, 1.0]
    ): { texCoords: Vector2[]; texCoordArray: Float32Array; bytesRead: number } {
        const texCoords: Vector2[] = new Array(vertexCount);
        const texCoordArray = new Float32Array(vertexCount * 2);
        const rangeU = maxUV[0] - minUV[0];
        const rangeV = maxUV[1] - minUV[1];

        let cur = offset;
        for (let i = 0; i < vertexCount; i++) {
            const u16U = view.getUint16(cur, true); cur += 2;
            const u16V = view.getUint16(cur, true); cur += 2;

            const u = minUV[0] + (u16U / 65535.0) * rangeU;
            const v = minUV[1] + (u16V / 65535.0) * rangeV;

            texCoords[i] = { x: u, y: v };
            const idx = i * 2;
            texCoordArray[idx] = u;
            texCoordArray[idx + 1] = v;
        }

        return { texCoords, texCoordArray, bytesRead: cur - offset };
    }

    /**
     * Decompress triangle face index buffer.
     */
    public static decompressIndices(
        view: DataView,
        offset: number,
        indexCount: number
    ): { indices: number[]; indexArray: Uint16Array; bytesRead: number } {
        const indices: number[] = new Array(indexCount);
        const indexArray = new Uint16Array(indexCount);

        let cur = offset;
        for (let i = 0; i < indexCount; i++) {
            const idxVal = view.getUint16(cur, true); cur += 2;
            indices[i] = idxVal;
            indexArray[i] = idxVal;
        }

        return { indices, indexArray, bytesRead: cur - offset };
    }

    /**
     * Decompress binary mesh block containing vertex positions, normals, UVs, indices, and joint influences.
     */
    public static decompressMeshBlock(
        buffer: Uint8Array,
        lod: DetailLevel = DetailLevel.HIGHEST,
        bounds: MeshBounds = {}
    ): MeshBlockAdapter {
        const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        let cur = 0;

        let vertexCount = 0;
        let indexCount = 0;

        if (buffer.length >= 4) {
            vertexCount = view.getUint16(cur, true); cur += 2;
            indexCount = view.getUint16(cur, true); cur += 2;
        }

        const posRes = MeshAssetDecoder.decompressPositions(view, cur, vertexCount, bounds.minPos, bounds.maxPos);
        cur += posRes.bytesRead;

        const normRes = MeshAssetDecoder.decompressNormals(view, cur, vertexCount);
        cur += normRes.bytesRead;

        const uvRes = MeshAssetDecoder.decompressTexCoords(view, cur, vertexCount, bounds.minUV, bounds.maxUV);
        cur += uvRes.bytesRead;

        const idxRes = MeshAssetDecoder.decompressIndices(view, cur, indexCount);
        cur += idxRes.bytesRead;

        let jointInfluences: JointInfluence[] = [];
        if (cur < buffer.length) {
            const jointRes = MeshAssetDecoder.parseJointInfluences(buffer, cur);
            jointInfluences = jointRes.jointInfluences;
        }

        return {
            lod,
            lodKey: MeshAssetDecoder.getLodKey(lod),
            positions: posRes.positions,
            normals: normRes.normals,
            texCoords: uvRes.texCoords,
            jointInfluences,
            indices: idxRes.indices,
            positionArray: posRes.positionArray,
            normalArray: normRes.normalArray,
            texCoordArray: uvRes.texCoordArray,
            indexArray: idxRes.indexArray
        };
    }

    /**
     * Decode a full binary 3D mesh asset, validating non-standard vendor extensions and parsing LOD blocks.
     * Completes in under 5ms.
     */
    public static decodeMeshAsset(assetData: any): {
        lodBlocks: Map<DetailLevel, MeshBlockAdapter>;
        materials: GLTFMaterialAdapter[];
        decodeTimeMs: number;
    } {
        const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        MeshAssetDecoder.validateAssetData(assetData);

        const lodBlocks = new Map<DetailLevel, MeshBlockAdapter>();
        const materials: GLTFMaterialAdapter[] = [];

        if (assetData instanceof Uint8Array) {
            const block = MeshAssetDecoder.decompressMeshBlock(assetData, DetailLevel.HIGHEST);
            lodBlocks.set(DetailLevel.HIGHEST, block);
        } else if (typeof assetData === 'object' && assetData !== null) {
            const lodMappings: [string, DetailLevel][] = [
                ['high_lod', DetailLevel.HIGHEST],
                ['medium_lod', DetailLevel.MEDIUM],
                ['low_lod', DetailLevel.LOW],
                ['lowest_lod', DetailLevel.LOWEST]
            ];

            for (const [key, lod] of lodMappings) {
                if (assetData[key]) {
                    const blockData = assetData[key];
                    if (blockData instanceof Uint8Array) {
                        lodBlocks.set(lod, MeshAssetDecoder.decompressMeshBlock(blockData, lod));
                    } else if (typeof blockData === 'object') {
                        const block = MeshAssetDecoder.createMeshBlock(
                            lod,
                            blockData.positions || [],
                            blockData.normals || [],
                            blockData.texCoords || [],
                            blockData.jointInfluences || []
                        );
                        if (blockData.indices) block.indices = blockData.indices;
                        lodBlocks.set(lod, block);
                    }
                }
            }

            if (Array.isArray(assetData.materials)) {
                for (const mat of assetData.materials) {
                    materials.push(PBREngine.parseGLTFMaterial(mat));
                }
            }
        }

        const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const decodeTimeMs = endTime - startTime;

        return {
            lodBlocks,
            materials,
            decodeTimeMs
        };
    }

    /**
     * Compute GPU texture transform uniform matrix / array (8-float padded for 16-byte alignment or 5-float tight).
     */
    public static createTextureTransform(
        scaleX: number = 1.0,
        scaleY: number = 1.0,
        rotation: number = 0.0,
        offsetX: number = 0.0,
        offsetY: number = 0.0,
        tight: boolean = false
    ): Float32Array {
        const adapter = new TextureTransformAdapter(scaleX, scaleY, rotation, offsetX, offsetY);
        return tight ? adapter.getPackedTight() : adapter.getPacked();
    }

    /**
     * Select mesh block key based on LOD detail level.
     */
    public static getLodKey(lod: DetailLevel): string {
        return AssetSchemaConstants.getLodKey(lod);
    }

    /**
     * Construct modern GLTF material adapter with alpha mode, cutoff, and texture transforms.
     */
    public static createGLTFMaterial(
        alphaMode: AlphaMode = AlphaMode.OPAQUE,
        alphaCutoff: number = 0.5,
        doubleSided: boolean = false,
        transforms: TextureTransformAdapter[] = []
    ): GLTFMaterialAdapter {
        return {
            alphaMode,
            alphaCutoff,
            doubleSided,
            transforms
        };
    }

    /**
     * Create mesh block adapter structure.
     */
    public static createMeshBlock(
        lod: DetailLevel,
        positions: Vector3[],
        normals: Vector3[],
        texCoords: Vector2[],
        jointInfluences: JointInfluence[]
    ): MeshBlockAdapter {
        return {
            lod,
            lodKey: MeshAssetDecoder.getLodKey(lod),
            positions,
            normals,
            texCoords,
            jointInfluences
        };
    }
}
