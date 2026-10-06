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

export class MeshAssetDecoder {
    /**
     * Generate structured ARIA label for a joint index and optional human-readable joint name.
     */
    public static getJointAriaLabel(jointIndex: number, jointName?: string): string {
        if (jointName && jointName.trim().length > 0) {
            return jointName;
        }
        return `Joint ${jointIndex}`;
    }

    /**
     * Create a JointInfluence structure with programmatic ARIA label metadata.
     */
    public static createJointInfluence(
        jointIndex: number,
        weight: number,
        jointName?: string,
        ariaLabel?: string
    ): JointInfluence {
        const resolvedLabel = ariaLabel || MeshAssetDecoder.getJointAriaLabel(jointIndex, jointName);
        const influence: JointInfluence = {
            jointIndex,
            weight,
            ariaLabel: resolvedLabel
        };
        if (jointName !== undefined) {
            influence.jointName = jointName;
        }
        return influence;
    }

    /**
     * Annotate joint influences array with joint names and accessible ARIA labels.
     */
    public static decorateJointInfluences(
        influences: JointInfluence[],
        jointNames?: Record<number, string> | string[]
    ): JointInfluence[] {
        return influences.map(inf => {
            const name = inf.jointName ?? (jointNames ? (Array.isArray(jointNames) ? jointNames[inf.jointIndex] : jointNames[inf.jointIndex]) : undefined);
            return MeshAssetDecoder.createJointInfluence(inf.jointIndex, inf.weight, name, inf.ariaLabel);
        });
    }

    /**
     * Decode rigged mesh joint influences from binary data.
     * Supports extended skeletons with up to 256 joints (0..255) and 0xFF sentinel byte.
     * Annotates parsed joint influences with human-readable names and ARIA labels.
     */
    public static parseJointInfluences(
        buffer: Uint8Array,
        offset: number = 0,
        jointNames?: Record<number, string> | string[]
    ): { jointInfluences: JointInfluence[]; bytesRead: number } {
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

            const name = jointNames ? (Array.isArray(jointNames) ? jointNames[jointIdx] : jointNames[jointIdx]) : undefined;
            const influence = MeshAssetDecoder.createJointInfluence(jointIdx, weight, name);

            influences.push(influence);
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
        tight: boolean = false,
        ariaLabel?: string
    ): Float32Array {
        const adapter = new TextureTransformAdapter(scaleX, scaleY, rotation, offsetX, offsetY, ariaLabel);
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
     * Create mesh block adapter structure with decorated joint influences.
     */
    public static createMeshBlock(
        lod: DetailLevel,
        positions: Vector3[],
        normals: Vector3[],
        texCoords: Vector2[],
        jointInfluences: JointInfluence[],
        jointNames?: Record<number, string> | string[]
    ): MeshBlockAdapter {
        const decoratedInfluences = MeshAssetDecoder.decorateJointInfluences(jointInfluences, jointNames);
        return {
            lod,
            lodKey: MeshAssetDecoder.getLodKey(lod),
            positions,
            normals,
            texCoords,
            jointInfluences: decoratedInfluences
        };
    }
}
