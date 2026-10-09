//! Pre-processed Unified-LLSD mesh schema models.

#[derive(Debug, Clone, PartialEq)]
pub struct LodThresholds {
    pub high_threshold: f32,
    pub medium_threshold: f32,
    pub low_threshold: f32,
    pub lowest_threshold: f32,
}

impl Default for LodThresholds {
    fn default() -> Self {
        Self {
            high_threshold: 200.0,
            medium_threshold: 80.0,
            low_threshold: 20.0,
            lowest_threshold: 4.0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct SubmeshMaterial {
    pub material_index: u32,
    pub indices: Vec<u32>,
    pub positions: Vec<f32>,
    pub normals: Vec<f32>,
    pub tex_coords: Vec<f32>,
    pub joint_influences: Vec<(u8, f32)>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PreprocessedMeshPayload {
    pub format: String,
    pub selected_lod: String,
    pub lod_thresholds: LodThresholds,
    pub submeshes: Vec<SubmeshMaterial>,
}

impl Default for PreprocessedMeshPayload {
    fn default() -> Self {
        Self {
            format: "unified-llsd-mesh-v1".to_string(),
            selected_lod: "high_lod".to_string(),
            lod_thresholds: LodThresholds::default(),
            submeshes: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mesh_payload_defaults() {
        let payload = PreprocessedMeshPayload {
            submeshes: vec![SubmeshMaterial {
                material_index: 0,
                indices: vec![0, 1, 2],
                positions: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
                normals: vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0],
                tex_coords: vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0],
                joint_influences: vec![],
            }],
            ..Default::default()
        };

        assert_eq!(payload.format, "unified-llsd-mesh-v1");
        assert_eq!(payload.submeshes.len(), 1);
        assert_eq!(payload.lod_thresholds.high_threshold, 200.0);
    }
}

