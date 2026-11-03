package com.firestorm.llcommon

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class MeshModelImporterTest {

    @Test
    fun testParseDAEBasic() {
        val daeXml = """<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <library_geometries>
    <geometry id="cube-mesh" name="Cube">
      <mesh>
        <source id="cube-positions">
          <float_array id="cube-positions-array" count="12">-1.0 -1.0 0.0 1.0 -1.0 0.0 1.0 1.0 0.0 -1.0 1.0 0.0</float_array>
        </source>
        <source id="cube-normals">
          <float_array id="cube-normals-array" count="3">0.0 0.0 1.0</float_array>
        </source>
        <vertices id="cube-vertices">
          <input semantic="POSITION" source="#cube-positions"/>
        </vertices>
        <triangles count="2">
          <input semantic="VERTEX" source="#cube-vertices" offset="0"/>
          <input semantic="NORMAL" source="#cube-normals" offset="1"/>
          <p>0 0 1 0 2 0 0 0 2 0 3 0</p>
        </triangles>
      </mesh>
    </geometry>
  </library_geometries>
</COLLADA>"""

        val model = MeshModelImporter.parseDAE(daeXml)
        assertNotNull(model)
        val highBlocks = model.lodBlocks[3]
        assertNotNull(highBlocks)
        assertEquals(1, highBlocks!!.size)

        val block = highBlocks[0]
        assertEquals("Cube", block.name)
        assertEquals(1, block.faces.size)

        val face = block.faces[0]
        assertEquals(6, face.positions.size) // 2 triangles = 6 vertices
        assertTrue(face.positions.size <= MeshModelImporter.MAX_VERTICES_PER_FACE)

        // Check LOD blocks populated across High, Medium, Low, Lowest
        assertNotNull(model.lodBlocks[2])
        assertNotNull(model.lodBlocks[1])
        assertNotNull(model.lodBlocks[0])
    }

    @Test
    fun testParseGLTF() {
        val gltfJson = """{
  "asset": { "version": "2.0" },
  "scenes": [ { "nodes": [0] } ],
  "nodes": [ { "mesh": 0 } ],
  "meshes": [ { "name": "TestMesh", "primitives": [ { "mode": 4 } ] } ]
}"""

        val model = MeshModelImporter.parseGLTF(gltfJson)
        assertNotNull(model)
        val highBlocks = model.lodBlocks[3]
        assertNotNull(highBlocks)
        assertEquals(1, highBlocks!!.size)
    }

    @Test
    fun testJointLimitEnforcement() {
        val skinInfo = MeshModelImporter.MeshSkinInfoData()
        for (i in 0 until 260) {
            skinInfo.jointNames.add("mJoint_$i")
            skinInfo.jointNums.add(i)
        }

        assertTrue(skinInfo.jointNames.size > MeshModelImporter.MAX_RIGGED_JOINTS)
        skinInfo.scrubInvalidJoints()

        assertEquals(0, skinInfo.jointNames.size)
        assertTrue(skinInfo.invalidJointsScrubbed)
    }

    @Test
    fun testLLSDPayloadGeneration() {
        val daeXml = """<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <library_geometries>
    <geometry id="cube-mesh" name="Cube">
      <mesh>
        <source id="cube-positions">
          <float_array id="cube-positions-array" count="9">-1.0 -1.0 0.0 1.0 -1.0 0.0 0.0 1.0 0.0</float_array>
        </source>
        <vertices id="cube-vertices">
          <input semantic="POSITION" source="#cube-positions"/>
        </vertices>
        <triangles count="1">
          <input semantic="VERTEX" source="#cube-vertices" offset="0"/>
          <p>0 1 2</p>
        </triangles>
      </mesh>
    </geometry>
  </library_geometries>
</COLLADA>"""

        val model = MeshModelImporter.parseDAE(daeXml)
        val llsdPayload = MeshModelImporter.generateLLSDPayload(model)

        assertNotNull(llsdPayload)
        assertEquals("ImportedDAE", llsdPayload["name"])
        assertEquals("mesh", llsdPayload["asset_type"])

        val resources = llsdPayload["asset_resources"] as? Map<*, *>
        assertNotNull(resources)
        val meshes = resources!!["meshes"] as? List<*>
        assertNotNull(meshes)
        assertEquals(1, meshes!!.size)
    }
}
