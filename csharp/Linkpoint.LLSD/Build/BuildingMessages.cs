using System;
using System.Collections.Generic;

namespace Linkpoint.LLSD.Build
{
    public enum PrimitiveShapeType
    {
        Box = 0,
        Sphere = 1,
        Cylinder = 2,
        Prism = 3,
        Torus = 4,
        Tube = 5,
        Ring = 6,
        Sculpt = 7,
        Mesh = 8
    }

    public enum BuildingCommandType
    {
        RezPrimitive,
        UpdateTransform,
        UpdateShapeParams,
        ApplyTexture,
        PickTexture
    }

    public struct Vector3Data
    {
        public float X { get; set; }
        public float Y { get; set; }
        public float Z { get; set; }

        public Vector3Data(float x, float y, float z)
        {
            X = x;
            Y = y;
            Z = z;
        }

        public LLSDValue ToLLSDArray()
        {
            var list = new List<LLSDValue>
            {
                LLSDValue.FromReal(X),
                LLSDValue.FromReal(Y),
                LLSDValue.FromReal(Z)
            };
            return LLSDValue.FromArray(list);
        }

        public static Vector3Data FromLLSDArray(LLSDValue arr)
        {
            if (arr == null || !arr.IsArray || arr.Count < 3)
                return new Vector3Data(0f, 0f, 0f);

            return new Vector3Data(
                (float)arr[0].AsReal(),
                (float)arr[1].AsReal(),
                (float)arr[2].AsReal()
            );
        }
    }

    public struct QuaternionData
    {
        public float X { get; set; }
        public float Y { get; set; }
        public float Z { get; set; }
        public float W { get; set; }

        public QuaternionData(float x, float y, float z, float w)
        {
            X = x;
            Y = y;
            Z = z;
            W = w;
        }

        public LLSDValue ToLLSDArray()
        {
            var list = new List<LLSDValue>
            {
                LLSDValue.FromReal(X),
                LLSDValue.FromReal(Y),
                LLSDValue.FromReal(Z),
                LLSDValue.FromReal(W)
            };
            return LLSDValue.FromArray(list);
        }

        public static QuaternionData FromLLSDArray(LLSDValue arr)
        {
            if (arr == null || !arr.IsArray || arr.Count < 4)
                return new QuaternionData(0f, 0f, 0f, 1f);

            return new QuaternionData(
                (float)arr[0].AsReal(),
                (float)arr[1].AsReal(),
                (float)arr[2].AsReal(),
                (float)arr[3].AsReal()
            );
        }
    }

    public struct Vector2Data
    {
        public float X { get; set; }
        public float Y { get; set; }

        public Vector2Data(float x, float y)
        {
            X = x;
            Y = y;
        }

        public LLSDValue ToLLSDArray()
        {
            var list = new List<LLSDValue>
            {
                LLSDValue.FromReal(X),
                LLSDValue.FromReal(Y)
            };
            return LLSDValue.FromArray(list);
        }

        public static Vector2Data FromLLSDArray(LLSDValue arr)
        {
            if (arr == null || !arr.IsArray || arr.Count < 2)
                return new Vector2Data(0f, 0f);

            return new Vector2Data(
                (float)arr[0].AsReal(),
                (float)arr[1].AsReal()
            );
        }
    }

    public class ShapeParameters
    {
        public Vector2Data Cut { get; set; } = new Vector2Data(0f, 1f);
        public Vector2Data Twist { get; set; } = new Vector2Data(0f, 0f);
        public float Hollow { get; set; } = 0f;
        public Vector2Data Taper { get; set; } = new Vector2Data(0f, 0f);
        public Vector2Data Shear { get; set; } = new Vector2Data(0f, 0f);
        public Vector2Data PathScale { get; set; } = new Vector2Data(1f, 1f);

        public LLSDValue ToLLSDMap()
        {
            var map = LLSDValue.EmptyMap();
            map["cut"] = Cut.ToLLSDArray();
            map["twist"] = Twist.ToLLSDArray();
            map["hollow"] = LLSDValue.FromReal(Hollow);
            map["taper"] = Taper.ToLLSDArray();
            map["shear"] = Shear.ToLLSDArray();
            map["path_scale"] = PathScale.ToLLSDArray();
            return map;
        }

        public static ShapeParameters FromLLSDMap(LLSDValue map)
        {
            var paramsObj = new ShapeParameters();
            if (map == null || !map.IsMap) return paramsObj;

            if (map.Has("cut")) paramsObj.Cut = Vector2Data.FromLLSDArray(map["cut"]);
            if (map.Has("twist")) paramsObj.Twist = Vector2Data.FromLLSDArray(map["twist"]);
            if (map.Has("hollow")) paramsObj.Hollow = (float)map["hollow"].AsReal();
            if (map.Has("taper")) paramsObj.Taper = Vector2Data.FromLLSDArray(map["taper"]);
            if (map.Has("shear")) paramsObj.Shear = Vector2Data.FromLLSDArray(map["shear"]);
            if (map.Has("path_scale")) paramsObj.PathScale = Vector2Data.FromLLSDArray(map["path_scale"]);

            return paramsObj;
        }
    }

    public class FaceTextureEntry
    {
        public int FaceIndex { get; set; } = -1; // -1 = default / all
        public string TextureId { get; set; } = LLUUID.Zero.ToString();
        public float[] RgbaColor { get; set; } = new float[] { 1f, 1f, 1f, 1f };
        public Vector2Data Scale { get; set; } = new Vector2Data(1f, 1f);
        public Vector2Data Offset { get; set; } = new Vector2Data(0f, 0f);
        public float Rotation { get; set; } = 0f;
        public float Glow { get; set; } = 0f;
        public bool Fullbright { get; set; } = false;

        public LLSDValue ToLLSDMap()
        {
            var map = LLSDValue.EmptyMap();
            map["face_index"] = LLSDValue.FromInteger(FaceIndex);
            map["texture_id"] = LLSDValue.FromString(TextureId);

            var colorList = new List<LLSDValue>();
            for (int i = 0; i < 4; i++)
            {
                float val = (RgbaColor != null && i < RgbaColor.Length) ? RgbaColor[i] : 1f;
                colorList.Add(LLSDValue.FromReal(val));
            }
            map["color"] = LLSDValue.FromArray(colorList);

            map["scale"] = Scale.ToLLSDArray();
            map["offset"] = Offset.ToLLSDArray();
            map["rotation"] = LLSDValue.FromReal(Rotation);
            map["glow"] = LLSDValue.FromReal(Glow);
            map["fullbright"] = LLSDValue.FromBoolean(Fullbright);
            return map;
        }

        public static FaceTextureEntry FromLLSDMap(LLSDValue map)
        {
            var entry = new FaceTextureEntry();
            if (map == null || !map.IsMap) return entry;

            if (map.Has("face_index")) entry.FaceIndex = map["face_index"].AsInteger();
            if (map.Has("texture_id")) entry.TextureId = map["texture_id"].AsString();

            if (map.Has("color") && map["color"].IsArray)
            {
                var colArr = map["color"];
                entry.RgbaColor = new float[4];
                for (int i = 0; i < 4 && i < colArr.Count; i++)
                {
                    entry.RgbaColor[i] = (float)colArr[i].AsReal();
                }
            }

            if (map.Has("scale")) entry.Scale = Vector2Data.FromLLSDArray(map["scale"]);
            if (map.Has("offset")) entry.Offset = Vector2Data.FromLLSDArray(map["offset"]);
            if (map.Has("rotation")) entry.Rotation = (float)map["rotation"].AsReal();
            if (map.Has("glow")) entry.Glow = (float)map["glow"].AsReal();
            if (map.Has("fullbright")) entry.Fullbright = map["fullbright"].AsBoolean();

            return entry;
        }
    }

    public class PrimitiveState
    {
        public uint LocalId { get; set; } = 0;
        public string ObjectId { get; set; } = LLUUID.Generate().ToString();
        public PrimitiveShapeType Shape { get; set; } = PrimitiveShapeType.Box;
        public Vector3Data Position { get; set; } = new Vector3Data(128f, 128f, 25f);
        public QuaternionData Rotation { get; set; } = new QuaternionData(0f, 0f, 0f, 1f);
        public Vector3Data Scale { get; set; } = new Vector3Data(0.5f, 0.5f, 0.5f);
        public ShapeParameters Params { get; set; } = new ShapeParameters();
        public Dictionary<int, FaceTextureEntry> Textures { get; set; } = new Dictionary<int, FaceTextureEntry>();

        public LLSDValue ToLLSDMap()
        {
            var map = LLSDValue.EmptyMap();
            map["local_id"] = LLSDValue.FromInteger((int)LocalId);
            map["object_id"] = LLSDValue.FromString(ObjectId);
            map["shape"] = LLSDValue.FromInteger((int)Shape);
            map["position"] = Position.ToLLSDArray();
            map["rotation"] = Rotation.ToLLSDArray();
            map["scale"] = Scale.ToLLSDArray();
            map["params"] = Params.ToLLSDMap();

            var texMap = LLSDValue.EmptyMap();
            foreach (var kvp in Textures)
            {
                texMap[kvp.Key.ToString()] = kvp.Value.ToLLSDMap();
            }
            map["textures"] = texMap;

            return map;
        }

        public static PrimitiveState FromLLSDMap(LLSDValue map)
        {
            var state = new PrimitiveState();
            if (map == null || !map.IsMap) return state;

            if (map.Has("local_id")) state.LocalId = (uint)map["local_id"].AsInteger();
            if (map.Has("object_id")) state.ObjectId = map["object_id"].AsString();
            if (map.Has("shape")) state.Shape = (PrimitiveShapeType)map["shape"].AsInteger();

            if (map.Has("position")) state.Position = Vector3Data.FromLLSDArray(map["position"]);
            if (map.Has("rotation")) state.Rotation = QuaternionData.FromLLSDArray(map["rotation"]);
            if (map.Has("scale")) state.Scale = Vector3Data.FromLLSDArray(map["scale"]);

            if (map.Has("params")) state.Params = ShapeParameters.FromLLSDMap(map["params"]);

            if (map.Has("textures") && map["textures"].IsMap)
            {
                state.Textures.Clear();
                var texDict = map["textures"].AsMap();
                foreach (var key in texDict.Keys)
                {
                    if (int.TryParse(key, out int faceIdx))
                    {
                        state.Textures[faceIdx] = FaceTextureEntry.FromLLSDMap(texDict[key]);
                    }
                }
            }

            return state;
        }
    }

    public class BuildingCommand
    {
        public BuildingCommandType CommandType { get; set; }
        public string ObjectId { get; set; } = LLUUID.Zero.ToString();
        public LLSDValue Payload { get; set; } = LLSDValue.EmptyMap();

        public LLSDValue ToLLSDMap()
        {
            var map = LLSDValue.EmptyMap();
            map["command"] = LLSDValue.FromString(CommandType.ToString());
            map["object_id"] = LLSDValue.FromString(ObjectId);
            map["payload"] = Payload ?? LLSDValue.EmptyMap();
            return map;
        }

        public static BuildingCommand FromLLSDMap(LLSDValue map)
        {
            var cmd = new BuildingCommand();
            if (map == null || !map.IsMap) return cmd;

            if (map.Has("command") && Enum.TryParse<BuildingCommandType>(map["command"].AsString(), out var type))
            {
                cmd.CommandType = type;
            }

            if (map.Has("object_id"))
            {
                cmd.ObjectId = map["object_id"].AsString();
            }

            if (map.Has("payload"))
            {
                cmd.Payload = map["payload"];
            }

            return cmd;
        }
    }
}
