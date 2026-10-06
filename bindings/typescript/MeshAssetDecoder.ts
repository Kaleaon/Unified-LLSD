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

function parseDomain3(
    domain: Vector3 | number[] | number | undefined,
    defaultVal: [number, number, number]
): [number, number, number] {
    if (domain === undefined || domain === null) return defaultVal;
    if (typeof domain === 'number') return [domain, domain, domain];
    if (Array.isArray(domain)) {
        return [
            domain[0] ?? defaultVal[0],
            domain[1] ?? defaultVal[1],
            domain[2] ?? defaultVal[2]
        ];
    }
    return [domain.x ?? defaultVal[0], domain.y ?? defaultVal[1], domain.z ?? defaultVal[2]];
}

function parseDomain2(
    domain: Vector2 | number[] | number | undefined,
    defaultVal: [number, number]
): [number, number] {
    if (domain === undefined || domain === null) return defaultVal;
    if (typeof domain === 'number') return [domain, domain];
    if (Array.isArray(domain)) {
        return [
            domain[0] ?? defaultVal[0],
            domain[1] ?? defaultVal[1]
        ];
    }
    return [domain.x ?? defaultVal[0], domain.y ?? defaultVal[1]];
}

export class MeshAssetDecoder {
    /**
     * Generic bit-stream dequantizer into a contiguous Float32Array.
     */
    public static dequantizeToTypedArray(
        buffer: Uint8Array,
        count: number,
        components: number,
        minD: number[],
        maxD: number[],
        offset: number = 0,
        bitsPerComponent: number = 16,
        out?: Float32Array
    ): Float32Array {
        if (offset < 0 || count < 0) {
            throw new RangeError('Invalid negative count or offset');
        }
        if (count === 0) {
            return out && out.length >= 0 ? out : new Float32Array(0);
        }

        const totalComponents = count * components;
        const requiredBits = totalComponents * bitsPerComponent;
        const requiredBytes = offset + Math.ceil(requiredBits / 8);

        if (buffer.length < requiredBytes) {
            throw new RangeError(
                `Unexpected end of bit stream: required ${requiredBytes} bytes (offset ${offset}, count ${count}, bits ${bitsPerComponent}), but buffer length is ${buffer.length}`
            );
        }

        const target = (out && out.length >= totalComponents) ? out : new Float32Array(totalComponents);
        const maxQuant = bitsPerComponent === 16 ? 65535 : ((1 << bitsPerComponent) - 1);
        const invMaxQuant = 1.0 / maxQuant;

        if (bitsPerComponent === 16) {
            let byteIdx = offset;
            let outIdx = 0;
            for (let i = 0; i < count; i++) {
                for (let c = 0; c < components; c++) {
                    const u16 = buffer[byteIdx] | (buffer[byteIdx + 1] << 8);
                    byteIdx += 2;
                    const minC = minD[c];
                    const rangeC = maxD[c] - minC;
                    target[outIdx++] = minC + (u16 * invMaxQuant) * rangeC;
                }
            }
            return target;
        } else if (bitsPerComponent === 8) {
            let byteIdx = offset;
            let outIdx = 0;
            for (let i = 0; i < count; i++) {
                for (let c = 0; c < components; c++) {
                    const u8 = buffer[byteIdx++];
                    const minC = minD[c];
                    const rangeC = maxD[c] - minC;
                    target[outIdx++] = minC + (u8 * invMaxQuant) * rangeC;
                }
            }
            return target;
        } else {
            let bitOffset = offset * 8;
            let outIdx = 0;
            for (let i = 0; i < count; i++) {
                for (let c = 0; c < components; c++) {
                    const byteIdx = bitOffset >> 3;
                    const bitShift = bitOffset & 7;
                    const b0 = buffer[byteIdx];
                    const b1 = byteIdx + 1 < buffer.length ? buffer[byteIdx + 1] : 0;
                    const b2 = byteIdx + 2 < buffer.length ? buffer[byteIdx + 2] : 0;
                    const raw32 = b0 | (b1 << 8) | (b2 << 16);
                    const uVal = (raw32 >> bitShift) & maxQuant;
                    bitOffset += bitsPerComponent;

                    const minC = minD[c];
                    const rangeC = maxD[c] - minC;
                    target[outIdx++] = minC + (uVal * invMaxQuant) * rangeC;
                }
            }
            return target;
        }
    }

    /**
     * Dequantize bit-packed position bit stream directly into contiguous Float32Array buffer (3 floats per vertex).
     */
    public static dequantizePositionsToTypedArray(
        buffer: Uint8Array,
        count: number,
        minDomain?: Vector3 | number[] | number,
        maxDomain?: Vector3 | number[] | number,
        offset: number = 0,
        bitsPerComponent: number = 16,
        out?: Float32Array
    ): Float32Array {
        const minD = parseDomain3(minDomain, [-0.5, -0.5, -0.5]);
        const maxD = parseDomain3(maxDomain, [0.5, 0.5, 0.5]);
        return MeshAssetDecoder.dequantizeToTypedArray(
            buffer,
            count,
            3,
            minD,
            maxD,
            offset,
            bitsPerComponent,
            out
        );
    }

    /**
     * Dequantize bit-packed normal bit stream directly into contiguous Float32Array buffer (3 floats per vertex).
     */
    public static dequantizeNormalsToTypedArray(
        buffer: Uint8Array,
        count: number,
        minDomain?: Vector3 | number[] | number,
        maxDomain?: Vector3 | number[] | number,
        offset: number = 0,
        bitsPerComponent: number = 16,
        out?: Float32Array
    ): Float32Array {
        const minD = parseDomain3(minDomain, [-1.0, -1.0, -1.0]);
        const maxD = parseDomain3(maxDomain, [1.0, 1.0, 1.0]);
        return MeshAssetDecoder.dequantizeToTypedArray(
            buffer,
            count,
            3,
            minD,
            maxD,
            offset,
            bitsPerComponent,
            out
        );
    }

    /**
     * Dequantize bit-packed texture coordinates bit stream directly into contiguous Float32Array buffer (2 floats per vertex).
     */
    public static dequantizeTexCoordsToTypedArray(
        buffer: Uint8Array,
        count: number,
        minDomain?: Vector2 | number[] | number,
        maxDomain?: Vector2 | number[] | number,
        offset: number = 0,
        bitsPerComponent: number = 16,
        out?: Float32Array
    ): Float32Array {
        const minD = parseDomain2(minDomain, [0.0, 0.0]);
        const maxD = parseDomain2(maxDomain, [1.0, 1.0]);
        return MeshAssetDecoder.dequantizeToTypedArray(
            buffer,
            count,
            2,
            minD,
            maxD,
            offset,
            bitsPerComponent,
            out
        );
    }

    /**
     * Conversion method: Flat Float32Array to Vector3[] array.
     */
    public static flatToVector3Array(flat: Float32Array): Vector3[] {
        const len = Math.floor(flat.length / 3);
        const result: Vector3[] = new Array(len);
        for (let i = 0; i < len; i++) {
            const idx = i * 3;
            result[i] = { x: flat[idx], y: flat[idx + 1], z: flat[idx + 2] };
        }
        return result;
    }

    /**
     * Conversion method: Vector3[] array to Flat Float32Array.
     */
    public static vector3ArrayToFlat(vectors: Vector3[], out?: Float32Array): Float32Array {
        const total = vectors.length * 3;
        const target = (out && out.length >= total) ? out : new Float32Array(total);
        for (let i = 0; i < vectors.length; i++) {
            const idx = i * 3;
            const v = vectors[i];
            target[idx] = v.x;
            target[idx + 1] = v.y;
            target[idx + 2] = v.z;
        }
        return target;
    }

    /**
     * Conversion method: Flat Float32Array to Vector2[] array.
     */
    public static flatToVector2Array(flat: Float32Array): Vector2[] {
        const len = Math.floor(flat.length / 2);
        const result: Vector2[] = new Array(len);
        for (let i = 0; i < len; i++) {
            const idx = i * 2;
            result[i] = { x: flat[idx], y: flat[idx + 1] };
        }
        return result;
    }

    /**
     * Conversion method: Vector2[] array to Flat Float32Array.
     */
    public static vector2ArrayToFlat(vectors: Vector2[], out?: Float32Array): Float32Array {
        const total = vectors.length * 2;
        const target = (out && out.length >= total) ? out : new Float32Array(total);
        for (let i = 0; i < vectors.length; i++) {
            const idx = i * 2;
            const v = vectors[i];
            target[idx] = v.x;
            target[idx + 1] = v.y;
        }
        return target;
    }

    public static ensureFlatPositions(meshBlock: MeshBlockAdapter): Float32Array {
        if (meshBlock.positionsFlat) return meshBlock.positionsFlat;
        if (meshBlock.positions instanceof Float32Array) return meshBlock.positions;
        return MeshAssetDecoder.vector3ArrayToFlat(meshBlock.positions);
    }

    public static ensureVector3Positions(meshBlock: MeshBlockAdapter): Vector3[] {
        if (Array.isArray(meshBlock.positions)) return meshBlock.positions;
        return MeshAssetDecoder.flatToVector3Array(meshBlock.positions);
    }

    public static ensureFlatNormals(meshBlock: MeshBlockAdapter): Float32Array {
        if (meshBlock.normalsFlat) return meshBlock.normalsFlat;
        if (meshBlock.normals instanceof Float32Array) return meshBlock.normals;
        return MeshAssetDecoder.vector3ArrayToFlat(meshBlock.normals);
    }

    public static ensureVector3Normals(meshBlock: MeshBlockAdapter): Vector3[] {
        if (Array.isArray(meshBlock.normals)) return meshBlock.normals;
        return MeshAssetDecoder.flatToVector3Array(meshBlock.normals);
    }

    public static ensureFlatTexCoords(meshBlock: MeshBlockAdapter): Float32Array {
        if (meshBlock.texCoordsFlat) return meshBlock.texCoordsFlat;
        if (meshBlock.texCoords instanceof Float32Array) return meshBlock.texCoords;
        return MeshAssetDecoder.vector2ArrayToFlat(meshBlock.texCoords);
    }

    public static ensureVector2TexCoords(meshBlock: MeshBlockAdapter): Vector2[] {
        if (Array.isArray(meshBlock.texCoords)) return meshBlock.texCoords;
        return MeshAssetDecoder.flatToVector2Array(meshBlock.texCoords);
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
        positions: Vector3[] | Float32Array,
        normals: Vector3[] | Float32Array,
        texCoords: Vector2[] | Float32Array,
        jointInfluences: JointInfluence[]
    ): MeshBlockAdapter {
        const positionsFlat = positions instanceof Float32Array ? positions : MeshAssetDecoder.vector3ArrayToFlat(positions);
        const normalsFlat = normals instanceof Float32Array ? normals : MeshAssetDecoder.vector3ArrayToFlat(normals);
        const texCoordsFlat = texCoords instanceof Float32Array ? texCoords : MeshAssetDecoder.vector2ArrayToFlat(texCoords);

        return {
            lod,
            lodKey: MeshAssetDecoder.getLodKey(lod),
            positions,
            normals,
            texCoords,
            jointInfluences,
            positionsFlat,
            normalsFlat,
            texCoordsFlat
        };
    }
}
