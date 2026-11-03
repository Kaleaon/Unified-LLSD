using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Linkpoint.LLSD.Codecs;

namespace Linkpoint.LLSD.Build
{
    public class BuildToolController
    {
        private readonly Dictionary<string, PrimitiveState> _activePrimitives = new Dictionary<string, PrimitiveState>();
        private string _selectedObjectId = null;
        private int _selectedFaceIndex = -1;
        private string _selectedInventoryTextureUuid = LLUUID.Zero.ToString();

        public string SelectedObjectId => _selectedObjectId;
        public int SelectedFaceIndex => _selectedFaceIndex;
        public string SelectedInventoryTextureUuid => _selectedInventoryTextureUuid;

        public PrimitiveState GetSelectedPrimitive()
        {
            if (_selectedObjectId != null && _activePrimitives.TryGetValue(_selectedObjectId, out var state))
            {
                return state;
            }
            return null;
        }

        public PrimitiveState GetPrimitive(string objectId)
        {
            if (objectId != null && _activePrimitives.TryGetValue(objectId, out var state))
            {
                return state;
            }
            return null;
        }

        public void SelectPrimitive(string objectId)
        {
            _selectedObjectId = objectId;
        }

        public void SelectFace(int faceIndex)
        {
            _selectedFaceIndex = faceIndex;
        }

        public PrimitiveState RezPrimitive(PrimitiveShapeType shape, Vector3Data position, QuaternionData rotation, Vector3Data scale)
        {
            var state = new PrimitiveState
            {
                LocalId = (uint)new Random().Next(1000, 999999),
                ObjectId = LLUUID.Generate().ToString(),
                Shape = shape,
                Position = position,
                Rotation = rotation,
                Scale = scale,
                Params = new ShapeParameters()
            };

            // Set default face texture
            var defaultFace = new FaceTextureEntry
            {
                FaceIndex = -1,
                TextureId = LLUUID.Zero.ToString(),
                RgbaColor = new float[] { 1f, 1f, 1f, 1f },
                Scale = new Vector2Data(1f, 1f),
                Offset = new Vector2Data(0f, 0f),
                Rotation = 0f,
                Glow = 0f,
                Fullbright = false
            };
            state.Textures[-1] = defaultFace;

            _activePrimitives[state.ObjectId] = state;
            _selectedObjectId = state.ObjectId;
            return state;
        }

        public BuildingCommand CreateRezCommand(PrimitiveShapeType shape, Vector3Data position, QuaternionData rotation, Vector3Data scale)
        {
            var state = RezPrimitive(shape, position, rotation, scale);
            return new BuildingCommand
            {
                CommandType = BuildingCommandType.RezPrimitive,
                ObjectId = state.ObjectId,
                Payload = state.ToLLSDMap()
            };
        }

        public PrimitiveState UpdateTransform(string objectId, Vector3Data position, QuaternionData rotation, Vector3Data scale)
        {
            var state = GetPrimitive(objectId);
            if (state == null) return null;

            state.Position = position;
            state.Rotation = rotation;

            // Ensure scale minimum boundary (> 0.01)
            state.Scale = new Vector3Data(
                Math.Max(0.01f, scale.X),
                Math.Max(0.01f, scale.Y),
                Math.Max(0.01f, scale.Z)
            );

            return state;
        }

        public PrimitiveState HandleGizmoEvent(string objectId, string gizmoAxis, string gizmoMode, float deltaAmount)
        {
            var state = GetPrimitive(objectId);
            if (state == null) return null;

            var pos = state.Position;
            var rot = state.Rotation;
            var scale = state.Scale;

            string mode = (gizmoMode ?? "").ToLowerInvariant();
            string axis = (gizmoAxis ?? "").ToLowerInvariant();

            if (mode == "move" || mode == "translate")
            {
                if (axis == "x") pos.X += deltaAmount;
                else if (axis == "y") pos.Y += deltaAmount;
                else if (axis == "z") pos.Z += deltaAmount;
            }
            else if (mode == "scale")
            {
                if (axis == "x") scale.X = Math.Max(0.01f, scale.X + deltaAmount);
                else if (axis == "y") scale.Y = Math.Max(0.01f, scale.Y + deltaAmount);
                else if (axis == "z") scale.Z = Math.Max(0.01f, scale.Z + deltaAmount);
                else if (axis == "all" || axis == "uniform")
                {
                    scale.X = Math.Max(0.01f, scale.X + deltaAmount);
                    scale.Y = Math.Max(0.01f, scale.Y + deltaAmount);
                    scale.Z = Math.Max(0.01f, scale.Z + deltaAmount);
                }
            }
            else if (mode == "rotate")
            {
                // Simple Euler rotation delta along chosen axis
                float radHalf = (deltaAmount * (float)Math.PI / 180f) / 2f;
                float sin = (float)Math.Sin(radHalf);
                float cos = (float)Math.Cos(radHalf);

                QuaternionData deltaRot = new QuaternionData(0f, 0f, 0f, 1f);
                if (axis == "x") deltaRot = new QuaternionData(sin, 0f, 0f, cos);
                else if (axis == "y") deltaRot = new QuaternionData(0f, sin, 0f, cos);
                else if (axis == "z") deltaRot = new QuaternionData(0f, 0f, sin, cos);

                // Multiply quaternions
                rot = MultiplyQuaternions(rot, deltaRot);
            }

            return UpdateTransform(objectId, pos, rot, scale);
        }

        public PrimitiveState UpdateShapeParameters(string objectId, ShapeParameters paramsObj)
        {
            var state = GetPrimitive(objectId);
            if (state == null) return null;

            if (paramsObj != null)
            {
                // Validate parameters
                paramsObj.Hollow = Math.Max(0f, Math.Min(0.95f, paramsObj.Hollow));
                state.Params = paramsObj;
            }

            return state;
        }

        public void PickTextureFromInventory(string textureUuid, string textureName = null)
        {
            if (string.IsNullOrEmpty(textureUuid))
            {
                textureUuid = LLUUID.Zero.ToString();
            }
            _selectedInventoryTextureUuid = textureUuid;
        }

        public FaceTextureEntry ApplyFaceTexture(string objectId, int faceIndex, FaceTextureEntry entry)
        {
            var state = GetPrimitive(objectId);
            if (state == null || entry == null) return null;

            // Validate and sanitize material parameters
            ValidateAndSanitizeMaterial(entry);

            entry.FaceIndex = faceIndex;
            state.Textures[faceIndex] = entry;

            return entry;
        }

        public Vector2Data CalculateTransformUV(Vector2Data inputUv, Vector2Data scale, Vector2Data offset, float rotationRad)
        {
            // Normalize scale & offset
            float sU = Math.Max(0.001f, scale.X);
            float sV = Math.Max(0.001f, scale.Y);

            // Clamp offsets to [-1, 1] range
            float oU = Math.Max(-1f, Math.Min(1f, offset.X));
            float oV = Math.Max(-1f, Math.Min(1f, offset.Y));

            // Scale and Offset
            float scaledU = (inputUv.X * sU) + oU;
            float scaledV = (inputUv.Y * sV) + oV;

            // Rotate around center (0.5, 0.5)
            float cU = scaledU - 0.5f;
            float cV = scaledV - 0.5f;

            float cos = (float)Math.Cos(rotationRad);
            float sin = (float)Math.Sin(rotationRad);

            float rotU = (cU * cos) - (cV * sin) + 0.5f;
            float rotV = (cU * sin) + (cV * cos) + 0.5f;

            return new Vector2Data(rotU, rotV);
        }

        public bool ValidateMaterialParams(FaceTextureEntry entry)
        {
            if (entry == null) return false;

            if (entry.Glow < 0f || entry.Glow > 1f) return false;
            if (entry.Scale.X <= 0f || entry.Scale.Y <= 0f) return false;
            if (entry.Offset.X < -1f || entry.Offset.X > 1f) return false;
            if (entry.Offset.Y < -1f || entry.Offset.Y > 1f) return false;

            if (entry.RgbaColor != null)
            {
                foreach (var channel in entry.RgbaColor)
                {
                    if (channel < 0f || channel > 1f) return false;
                }
            }

            if (string.IsNullOrEmpty(entry.TextureId)) return false;

            return true;
        }

        public void ValidateAndSanitizeMaterial(FaceTextureEntry entry)
        {
            if (entry == null) return;

            entry.Glow = Math.Max(0f, Math.Min(1f, entry.Glow));
            entry.Scale = new Vector2Data(Math.Max(0.001f, entry.Scale.X), Math.Max(0.001f, entry.Scale.Y));
            entry.Offset = new Vector2Data(Math.Max(-1f, Math.Min(1f, entry.Offset.X)), Math.Max(-1f, Math.Min(1f, entry.Offset.Y)));

            if (entry.RgbaColor != null && entry.RgbaColor.Length >= 4)
            {
                for (int i = 0; i < 4; i++)
                {
                    entry.RgbaColor[i] = Math.Max(0f, Math.Min(1f, entry.RgbaColor[i]));
                }
            }
            else
            {
                entry.RgbaColor = new float[] { 1f, 1f, 1f, 1f };
            }

            if (string.IsNullOrEmpty(entry.TextureId))
            {
                entry.TextureId = LLUUID.Zero.ToString();
            }
        }

        public byte[] SerializeCommandToBinary(BuildingCommand command)
        {
            var llsdMap = command.ToLLSDMap();
            return LLSDBinaryCodec.Encode(llsdMap);
        }

        public string SerializeCommandToNotation(BuildingCommand command)
        {
            var llsdMap = command.ToLLSDMap();
            return LLSDNotationCodec.Encode(llsdMap);
        }

        public BuildingCommand DeserializeCommandFromBinary(byte[] binaryData)
        {
            var llsdMap = LLSDBinaryCodec.Decode(binaryData);
            return BuildingCommand.FromLLSDMap(llsdMap);
        }

        public BuildingCommand DeserializeCommandFromNotation(string notationData)
        {
            var llsdMap = LLSDNotationCodec.Decode(notationData);
            return BuildingCommand.FromLLSDMap(llsdMap);
        }

        private QuaternionData MultiplyQuaternions(QuaternionData q1, QuaternionData q2)
        {
            float w1 = q1.W, x1 = q1.X, y1 = q1.Y, z1 = q1.Z;
            float w2 = q2.W, x2 = q2.X, y2 = q2.Y, z2 = q2.Z;

            return new QuaternionData(
                w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
                w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
                w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
                w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2
            );
        }
    }
}
