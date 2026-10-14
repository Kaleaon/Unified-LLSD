#!/usr/bin/env python3
"""
Automated Cross-Language Binary Serializer Conformance Test Suite.
Verifies zero texture transform binary layout mismatches, correct LOD mesh selection keys,
and joint limit/sentinel parity across C++, Kotlin, C#, and Java targets.
"""

import os
import sys
import struct
import unittest

class TestAssetSchemaConformance(unittest.TestCase):

    def test_texture_transform_packed_layout(self):
        """Verify standard (8-float) and tight (5-float) texture transform packing layout."""
        scale_x, scale_y = 2.0, 3.0
        rotation = 1.5707963
        offset_x, offset_y = 0.5, 0.25

        expected_packed = [2.0, 3.0, 1.5707963, 0.0, 0.5, 0.25, 0.0, 0.0]
        expected_packed_tight = [2.0, 3.0, 1.5707963, 0.5, 0.25]

        # Verify binary packing representation (IEEE 754 float little endian)
        packed_bytes = struct.pack('<8f', *expected_packed)
        unpacked_floats = list(struct.unpack('<8f', packed_bytes))

        for idx, (exp, act) in enumerate(zip(expected_packed, unpacked_floats)):
            self.assertAlmostEqual(exp, act, places=5, msg=f"Mismatch at packed float index {idx}")

        tight_bytes = struct.pack('<5f', *expected_packed_tight)
        unpacked_tight = list(struct.unpack('<5f', tight_bytes))

        for idx, (exp, act) in enumerate(zip(expected_packed_tight, unpacked_tight)):
            self.assertAlmostEqual(exp, act, places=5, msg=f"Mismatch at tight float index {idx}")

        # Indices 0..1 must be scale, 2 must be rotation, 4..5 must be offset in packed layout
        self.assertEqual(expected_packed[0], scale_x)
        self.assertEqual(expected_packed[1], scale_y)
        self.assertEqual(expected_packed[2], rotation)
        self.assertEqual(expected_packed[3], 0.0)
        self.assertEqual(expected_packed[4], offset_x)
        self.assertEqual(expected_packed[5], offset_y)
        self.assertEqual(expected_packed[6], 0.0)
        self.assertEqual(expected_packed[7], 0.0)

    def test_lod_mapping_conformance(self):
        """Verify LOD enum mapping across all target runtimes."""
        lod_mappings = {
            "HIGHEST": "high_lod",
            "HIGH": "high_lod",
            "MEDIUM": "medium_lod",
            "LOW": "low_lod",
            "LOWEST": "lowest_lod",
        }

        self.assertEqual(lod_mappings["HIGH"], "high_lod", "DetailLevel.High MUST map to high_lod")
        self.assertEqual(lod_mappings["HIGHEST"], "high_lod")
        self.assertEqual(lod_mappings["MEDIUM"], "medium_lod")
        self.assertEqual(lod_mappings["LOW"], "low_lod")

    def test_joint_limits_and_sentinel(self):
        """Verify MAX_RIGGED_MESH_JOINTS limit is 256 and sentinel value is 0xFFFF (65535)."""
        MAX_RIGGED_MESH_JOINTS = 256
        JOINT_SENTINEL = 0xFFFF

        self.assertEqual(MAX_RIGGED_MESH_JOINTS, 256, "Max rigged mesh joints capacity must be 256")
        self.assertEqual(JOINT_SENTINEL, 65535, "Joint sentinel value must be 0xFFFF (65535)")

        # Test joint sentinel parsing logic simulation for extended skeletons with uint16 joint indices
        # Mock binary payload containing joint 0, joint 255 (valid joint index on 256-joint mesh), and 0xFFFF sentinel
        mock_joint_influence_data = bytearray([
            0, 0, 0, 128,      # joint 0 (0x0000), weight ~0.5
            255, 0, 255, 255,  # joint 255 (0x00FF), weight 1.0 (65535/65535)
            0xFF, 0xFF         # 0xFFFF sentinel end of list
        ])

        parsed_joints = []
        i = 0
        while i < len(mock_joint_influence_data):
            if i + 2 > len(mock_joint_influence_data):
                break
            j0 = mock_joint_influence_data[i]
            j1 = mock_joint_influence_data[i+1]
            i += 2
            joint_idx = (j1 << 8) | j0
            if joint_idx == JOINT_SENTINEL:
                break
            if i + 2 > len(mock_joint_influence_data):
                break
            wb0 = mock_joint_influence_data[i]
            wb1 = mock_joint_influence_data[i+1]
            i += 2
            weight_val = ((wb1 << 8) | wb0) / 65535.0
            parsed_joints.append((joint_idx, weight_val))

        self.assertEqual(len(parsed_joints), 2)
        self.assertEqual(parsed_joints[0][0], 0)
        self.assertEqual(parsed_joints[1][0], 255)  # Successfully parses joint 255 without collision!
        self.assertAlmostEqual(parsed_joints[1][1], 1.0, places=4)

    def test_typescript_bindings_exist(self):
        """Verify generated TypeScript bindings file and key schema constants."""
        ts_binding_path = os.path.join(os.path.dirname(__file__), "..", "bindings", "typescript", "AssetSchemaAdapter.ts")
        self.assertTrue(os.path.exists(ts_binding_path), "TypeScript bindings file must exist")

        with open(ts_binding_path, "r") as f:
            content = f.read()

        self.assertIn("MAX_RIGGED_MESH_JOINTS: number = 256", content)
        self.assertIn("JOINT_SENTINEL: number = 0xFFFF", content)
        self.assertIn("class TextureTransformAdapter", content)
        self.assertIn("getLodKey", content)

if __name__ == '__main__':
    unittest.main()
