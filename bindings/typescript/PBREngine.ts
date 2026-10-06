/**
 * GLTF PBR Material Engine and GPU Texture Transform Matrices.
 */

import {
    AlphaMode,
    GLTFMaterialAdapter,
    TextureTransformAdapter
} from './AssetSchemaAdapter.js';

export class PBREngine {
    /**
     * Calculate 3x3 2D texture transform matrix (Float32Array of 9 floats).
     * M = [ scaleX*cos(r), -scaleY*sin(r), offsetX,
     *       scaleX*sin(r),  scaleY*cos(r), offsetY,
     *       0,              0,             1 ]
     */
    public static createTextureTransformMatrix(
        scaleX: number = 1.0,
        scaleY: number = 1.0,
        rotation: number = 0.0,
        offsetX: number = 0.0,
        offsetY: number = 0.0
    ): Float32Array {
        const cosR = Math.cos(rotation);
        const sinR = Math.sin(rotation);
        return new Float32Array([
            scaleX * cosR, -scaleY * sinR, offsetX,
            scaleX * sinR,  scaleY * cosR, offsetY,
            0.0,            0.0,           1.0
        ]);
    }

    /**
     * Generate 8-float packed uniform array adhering strictly to 16-byte alignment rules
     * defined in FlatBuffers schemas (scaleX, scaleY, rotation, pad0, offsetX, offsetY, pad1, pad2).
     */
    public static getPackedUniforms(transform: TextureTransformAdapter): Float32Array {
        return transform.getPacked();
    }

    /**
     * Generate 5-float tight uniform array (scaleX, scaleY, rotation, offsetX, offsetY).
     */
    public static getPackedTightUniforms(transform: TextureTransformAdapter): Float32Array {
        return transform.getPackedTight();
    }

    /**
     * Parse GLTF material adapter with alpha mode, cutoff, double sidedness, and texture transforms.
     * Rejects non-standard vendor extensions.
     */
    public static parseGLTFMaterial(materialObj: any): GLTFMaterialAdapter {
        if (materialObj && typeof materialObj === 'object') {
            for (const key of Object.keys(materialObj)) {
                if (key.startsWith('vendor_') || key.startsWith('ext_') || key === 'vendor_extension') {
                    throw new Error(`Rejected non-standard vendor extension: ${key}`);
                }
            }
        }

        let alphaMode = AlphaMode.OPAQUE;
        const modeInput = materialObj?.alphaMode;
        if (typeof modeInput === 'number') {
            alphaMode = modeInput;
        } else if (typeof modeInput === 'string') {
            const upperStr = modeInput.toUpperCase();
            if (upperStr === 'MASK') alphaMode = AlphaMode.MASK;
            else if (upperStr === 'BLEND') alphaMode = AlphaMode.BLEND;
        }

        const alphaCutoff = typeof materialObj?.alphaCutoff === 'number' ? materialObj.alphaCutoff : 0.5;
        const doubleSided = Boolean(materialObj?.doubleSided);

        const transforms: TextureTransformAdapter[] = [];
        if (Array.isArray(materialObj?.transforms)) {
            for (const t of materialObj.transforms) {
                transforms.push(new TextureTransformAdapter(
                    t.scaleX ?? t.scale?.[0] ?? 1.0,
                    t.scaleY ?? t.scale?.[1] ?? 1.0,
                    t.rotation ?? 0.0,
                    t.offsetX ?? t.offset?.[0] ?? 0.0,
                    t.offsetY ?? t.offset?.[1] ?? 0.0
                ));
            }
        }

        return {
            alphaMode,
            alphaCutoff,
            doubleSided,
            transforms
        };
    }
}
