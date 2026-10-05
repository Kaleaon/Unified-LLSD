using System;
using Unified.LLSD;

namespace Unified.LLSD.Tests
{
    public class Program
    {
        public static int Main()
        {
            Console.WriteLine("Running C# LLSD Conformance Tests...");

            // Test 1: 64-bit Integer
            long bigInt = 9223372036854775807L;
            LLSD sd = new LLSD(bigInt);
            if (sd.AsLong() != bigInt) throw new Exception("64-bit integer failed");

            // Test 2: XML Roundtrip
            LLSD map = LLSD.EmptyMap();
            map["int"] = 42L;
            map["str"] = "hello";
            map["bool"] = true;
            map["real"] = 3.14159;

            string xml = LLSDSerialize.ToXML(map, true);
            LLSD backXml = LLSDSerialize.FromXML(xml);

            if (backXml["int"].AsLong() != 42L) throw new Exception("XML int failed");
            if (backXml["str"].AsString() != "hello") throw new Exception("XML str failed");
            if (!backXml["bool"].AsBoolean()) throw new Exception("XML bool failed");

            // Test 3: Binary Roundtrip & Endianness
            LLSD mapBin = LLSD.EmptyMap();
            mapBin["int"] = 12345;
            mapBin["date"] = new LLDate(123456789.0);

            byte[] bin = LLSDSerialize.ToBinary(mapBin);
            LLSD backBin = LLSDSerialize.FromBinary(bin);

            if (backBin["int"].AsInteger() != 12345) throw new Exception("Binary int failed");
            if (Math.Abs(backBin["date"].AsDate().SecondsSinceEpoch - 123456789.0) > 0.001) throw new Exception("Binary date LE failed");

            // Test 4: Notation Roundtrip
            LLSD mapNot = LLSD.EmptyMap();
            mapNot["str"] = "testing notation";
            mapNot["uuid"] = new LLUUID("550e8400-e29b-41d4-a716-446655440000");

            string notation = LLSDSerialize.ToNotation(mapNot);
            LLSD backNot = LLSDSerialize.FromNotation(notation);

            if (backNot["str"].AsString() != "testing notation") throw new Exception("Notation str failed");
            if (backNot["uuid"].AsUUID().ToString() != "550e8400-e29b-41d4-a716-446655440000") throw new Exception("Notation uuid failed");

            Console.WriteLine("All C# LLSD Conformance Tests Passed!");
            return 0;
        }
    }
}
