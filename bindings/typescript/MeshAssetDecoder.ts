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
    AlphaMode,
    LodThresholdsAdapter,
    SubmeshMaterialAdapter,
    PreprocessedMeshPayloadAdapter
} from './AssetSchemaAdapter.js';

export class MeshAssetDecoder {
    /**
     * Parse pre-processed Unified-LLSD payload into ready-to-render submesh material buffers and LOD distance thresholds.
     */
    public static parsePreprocessedPayload(payload: any): PreprocessedMeshPayloadAdapter {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Invalid preprocessed payload object');
        }

        const format = payload.format || 'unified-llsd-mesh-v1';
        const selectedLod = payload.selected_lod || payload.selectedLod || 'high_lod';

        const rawThresholds = payload.lod_thresholds || payload.lodThresholds || {};
        const lodThresholds: LodThresholdsAdapter = {
            highThreshold: Number(rawThresholds.high_threshold ?? rawThresholds.highThreshold ?? 200.0),
            mediumThreshold: Number(rawThresholds.medium_threshold ?? rawThresholds.mediumThreshold ?? 80.0),
            lowThreshold: Number(rawThresholds.low_threshold ?? rawThresholds.lowThreshold ?? 20.0),
            lowestThreshold: Number(rawThresholds.lowest_threshold ?? rawThresholds.lowestThreshold ?? 4.0),
        };

        const rawSubmeshes = payload.submeshes || payload.parts || [];
        const submeshes: SubmeshMaterialAdapter[] = rawSubmeshes.map((sub: any, idx: number) => ({
            materialIndex: Number(sub.material_index ?? sub.materialIndex ?? idx),
            indices: Array.isArray(sub.indices) ? sub.indices.map(Number) : [],
            positions: Array.isArray(sub.positions) ? sub.positions : (Array.isArray(sub.vertices) ? sub.vertices : []),
            normals: Array.isArray(sub.normals) ? sub.normals : [],
            texCoords: Array.isArray(sub.tex_coords ?? sub.texCoords) ? (sub.tex_coords ?? sub.texCoords) : [],
            jointInfluences: sub.jointInfluences || [],
            joints: sub.joints || [],
            jointWeights: sub.jointWeights || sub.joint_weights || []
        }));

        return {
            format,
            selectedLod,
            lodThresholds,
            submeshes,
            parts: submeshes,
            lods: payload.lods || { [selectedLod]: submeshes },
            skin: payload.skin || null,
            physics: payload.physics || null,
            metadata: payload.metadata || null
        };
    }
    /**
     * Decode rigged mesh joint influences from binary data.
     * Supports extended skeletons with up to 256 joints (0..255) and 0xFF sentinel byte.
     */
    public static parseJointInfluences(buffer: Uint8Array, offset: number = 0): { jointInfluences: JointInfluence[]; bytesRead: number } {
        const influences: JointInfluence[] = [];
        let cur = offset;
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

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
