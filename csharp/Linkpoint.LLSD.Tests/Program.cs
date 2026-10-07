using System;
using System.Reflection;
using System.Threading.Tasks;

namespace Linkpoint.LLSD.Tests
{
    public class FactAttribute : Attribute { }

    public static class Program
    {
        public static int Main(string[] args)
        {
            Console.WriteLine("=========================================");
            Console.WriteLine("Running Linkpoint.LLSD C# Test Suite...");
            Console.WriteLine("=========================================");

            int passed = 0;
            int failed = 0;

            var testClasses = new Type[]
            {
                typeof(LLSDCodecTests),
                typeof(LLSDConformanceTests),
                typeof(NetworkTests),
                typeof(CapabilityClientTests)
            };

            foreach (var type in testClasses)
            {
                var instance = Activator.CreateInstance(type);
                var methods = type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly);

                foreach (var method in methods)
                {
                    try
                    {
                        Console.Write($"[RUNNING] {type.Name}.{method.Name}... ");
                        var result = method.Invoke(instance, null);
                        if (result is Task task)
                        {
                            task.GetAwaiter().GetResult();
                        }
                        Console.WriteLine("PASSED");
                        passed++;
                    }
                    catch (TargetInvocationException ex)
                    {
                        Console.WriteLine("FAILED");
                        Console.WriteLine($"   --> {ex.InnerException?.Message ?? ex.Message}");
                        failed++;
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("FAILED");
                        Console.WriteLine($"   --> {ex.Message}");
                        failed++;
                    }
                }
            }

            Console.WriteLine("=========================================");
            Console.WriteLine($"Test Results: {passed} passed, {failed} failed.");
            Console.WriteLine("=========================================");

            return failed == 0 ? 0 : 1;
        }
    }
}
