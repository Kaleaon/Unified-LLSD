package com.unifiedllsd.schema

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AssetSchemaAdapterTest {

    @Test
    fun testTextureTransformAdapterPacking() {
        val adapter = TextureTransformAdapter(
            scaleX = 2.0f,
            scaleY = 3.0f,
            rotation = 1.5707963f,
            offsetX = 0.5f,
            offsetY = 0.25f
        )

        val packed = adapter.getPacked()
        assertEquals(8, packed.size)
        assertEquals(2.0f, packed[0])
        assertEquals(3.0f, packed[1])
        assertTrue(Math.abs(packed[2] - 1.5707963f) < 0.0001f)
        assertEquals(0.0f, packed[3])
        assertEquals(0.5f, packed[4])
        assertEquals(0.25f, packed[5])
        assertEquals(0.0f, packed[6])
        assertEquals(0.0f, packed[7])

        val tight = adapter.getPackedTight()
        assertEquals(5, tight.size)
        assertEquals(2.0f, tight[0])
        assertEquals(3.0f, tight[1])
        assertTrue(Math.abs(tight[2] - 1.5707963f) < 0.0001f)
        assertEquals(0.5f, tight[3])
        assertEquals(0.25f, tight[4])
    }

    @Test
    fun testGLTFMaterialPacking() {
        val mat = GLTFMaterial(
            alphaMode = AlphaMode.OPAQUE,
            alphaCutoff = 0.5f,
            doubleSided = false,
            transforms = mutableListOf(
                TextureTransformAdapter(2.0f, 3.0f, 1.5707963f, 0.5f, 0.25f)
            )
        )

        val packed = mat.getPacked(0)
        assertEquals(8, packed.size)
        assertEquals(2.0f, packed[0])
        assertEquals(3.0f, packed[1])
        assertTrue(Math.abs(packed[2] - 1.5707963f) < 0.0001f)
        assertEquals(0.0f, packed[3])
        assertEquals(0.5f, packed[4])
        assertEquals(0.25f, packed[5])

        val tight = mat.getPackedTight(0)
        assertEquals(5, tight.size)
        assertEquals(2.0f, tight[0])
        assertEquals(3.0f, tight[1])
        assertTrue(Math.abs(tight[2] - 1.5707963f) < 0.0001f)
        assertEquals(0.5f, tight[3])
        assertEquals(0.25f, tight[4])
    }
}
