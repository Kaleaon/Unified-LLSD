using System;
using Linkpoint.LLSD.Build;

namespace Linkpoint.LLSD.Tests
{
    public class BuildToolControllerTests
    {
        public void TestPrimitiveRezzingAndTransform()
        {
            var controller = new BuildToolController();
            var pos = new Vector3Data(10f, 20f, 30f);
            var rot = new QuaternionData(0f, 0f, 0f, 1f);
            var scale = new Vector3Data(1f, 2f, 3f);

            var state = controller.RezPrimitive(PrimitiveShapeType.Cylinder, pos, rot, scale);
            Assert.NotNull(state, "PrimitiveState should not be null");
            Assert.Equal(PrimitiveShapeType.Cylinder, state.Shape, "Shape should match Cylinder");
            Assert.Equal(10f, state.Position.X, "Position X should match 10");

            // Test transform update
            var newPos = new Vector3Data(15f, 25f, 35f);
            var updated = controller.UpdateTransform(state.ObjectId, newPos, rot, scale);
            Assert.Equal(15f, updated.Position.X, "Updated position X should match 15");
        }

        public void TestGizmoEventRouting()
        {
            var controller = new BuildToolController();
            var state = controller.RezPrimitive(
                PrimitiveShapeType.Box,
                new Vector3Data(0f, 0f, 0f),
                new QuaternionData(0f, 0f, 0f, 1f),
                new Vector3Data(1f, 1f, 1f)
            );

            // Move X gizmo
            controller.HandleGizmoEvent(state.ObjectId, "x", "move", 2.5f);
            Assert.Equal(2.5f, controller.GetPrimitive(state.ObjectId).Position.X, "Gizmo move X should adjust position");

            // Scale Y gizmo
            controller.HandleGizmoEvent(state.ObjectId, "y", "scale", 0.5f);
            Assert.Equal(1.5f, controller.GetPrimitive(state.ObjectId).Scale.Y, "Gizmo scale Y should adjust scale");
        }

        public void TestTexturePickingAndUVMath()
        {
            var controller = new BuildToolController();
            string texUuid = LLUUID.Generate().ToString();

            controller.PickTextureFromInventory(texUuid, "Wood Planks");
            Assert.Equal(texUuid, controller.SelectedInventoryTextureUuid, "Selected inventory texture UUID should match");

            // UV math test
            var inputUv = new Vector2Data(0.5f, 0.5f);
            var scale = new Vector2Data(2f, 2f);
            var offset = new Vector2Data(0.1f, 0.1f);
            float rotationRad = 0f;

            var resultUv = controller.CalculateTransformUV(inputUv, scale, offset, rotationRad);
            Assert.True(Math.Abs(resultUv.X - 1.1f) < 0.001f, $"Result U should be ~1.1, got {resultUv.X}");
            Assert.True(Math.Abs(resultUv.Y - 1.1f) < 0.001f, $"Result V should be ~1.1, got {resultUv.Y}");
        }

        public void TestMaterialValidation()
        {
            var controller = new BuildToolController();
            var validEntry = new FaceTextureEntry
            {
                FaceIndex = 0,
                TextureId = LLUUID.Generate().ToString(),
                RgbaColor = new float[] { 0.5f, 0.5f, 0.5f, 1f },
                Scale = new Vector2Data(1f, 1f),
                Offset = new Vector2Data(0f, 0f),
                Glow = 0.2f
            };

            Assert.True(controller.ValidateMaterialParams(validEntry), "Valid face texture entry should pass validation");

            var invalidEntry = new FaceTextureEntry
            {
                Glow = 1.5f, // Invalid (> 1.0)
                Scale = new Vector2Data(-1f, 1f) // Invalid (< 0)
            };

            Assert.False(controller.ValidateMaterialParams(invalidEntry), "Invalid face texture entry should fail validation");
        }

        public void TestLLSDCommandBinaryAndNotationFidelity()
        {
            var controller = new BuildToolController();
            var pos = new Vector3Data(100f, 100f, 10f);
            var rot = new QuaternionData(0f, 0f, 0f, 1f);
            var scale = new Vector3Data(2f, 2f, 2f);

            var cmd = controller.CreateRezCommand(PrimitiveShapeType.Sphere, pos, rot, scale);

            // Test Notation
            string notationStr = controller.SerializeCommandToNotation(cmd);
            Assert.NotNull(notationStr, "Notation serialization should produce string");
            var deserializedNotationCmd = controller.DeserializeCommandFromNotation(notationStr);
            Assert.Equal(cmd.CommandType, deserializedNotationCmd.CommandType, "CommandType should match after notation roundtrip");
            Assert.Equal(cmd.ObjectId, deserializedNotationCmd.ObjectId, "ObjectId should match after notation roundtrip");

            // Test Binary
            byte[] binaryBytes = controller.SerializeCommandToBinary(cmd);
            Assert.NotNull(binaryBytes, "Binary serialization should produce byte array");
            var deserializedBinaryCmd = controller.DeserializeCommandFromBinary(binaryBytes);
            Assert.Equal(cmd.CommandType, deserializedBinaryCmd.CommandType, "CommandType should match after binary roundtrip");
            Assert.Equal(cmd.ObjectId, deserializedBinaryCmd.ObjectId, "ObjectId should match after binary roundtrip");
        }
    }
}
