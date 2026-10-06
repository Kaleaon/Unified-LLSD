using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Linkpoint.LLSD.Tests
{
    public static class Assert
    {
        public static void True(bool condition, string? message = null)
        {
            if (!condition)
            {
                throw new Exception($"Assert.True failed. {message}");
            }
        }

        public static void False(bool condition, string? message = null)
        {
            if (condition)
            {
                throw new Exception($"Assert.False failed. {message}");
            }
        }

        public static void Equal<T>(T expected, T actual, string? message = null)
        {
            if (expected is byte[] expBytes && actual is byte[] actBytes)
            {
                if (!expBytes.SequenceEqual(actBytes))
                {
                    throw new Exception($"Assert.Equal failed for byte arrays. {message}");
                }
                return;
            }

            if (!EqualityComparer<T>.Default.Equals(expected, actual))
            {
                throw new Exception($"Assert.Equal failed. Expected: '{expected}', Actual: '{actual}'. {message}");
            }
        }

        public static void Equal(double expected, double actual, int precision)
        {
            double diff = Math.Abs(expected - actual);
            double tolerance = Math.Pow(10, -precision);
            if (diff > tolerance && !(double.IsNaN(expected) && double.IsNaN(actual)))
            {
                throw new Exception($"Assert.Equal failed for double. Expected: '{expected}', Actual: '{actual}', Diff: '{diff}'.");
            }
        }

        public static void Contains<T>(T item, IEnumerable<T> collection)
        {
            if (!collection.Contains(item))
            {
                throw new Exception($"Assert.Contains failed. Item '{item}' not found in collection.");
            }
        }

        public static void Empty<T>(IEnumerable<T> collection)
        {
            if (collection.Any())
            {
                throw new Exception("Assert.Empty failed. Collection is not empty.");
            }
        }

        public static T Throws<T>(Action action) where T : Exception
        {
            try
            {
                action();
            }
            catch (T ex)
            {
                return ex;
            }
            catch (Exception ex)
            {
                throw new Exception($"Assert.Throws failed. Expected {typeof(T).Name}, but got {ex.GetType().Name}: {ex.Message}");
            }
            throw new Exception($"Assert.Throws failed. Expected {typeof(T).Name}, but no exception was thrown.");
        }

        public static async Task<T> ThrowsAsync<T>(Func<Task> action) where T : Exception
        {
            try
            {
                await action();
            }
            catch (T ex)
            {
                return ex;
            }
            catch (Exception ex)
            {
                throw new Exception($"Assert.ThrowsAsync failed. Expected {typeof(T).Name}, but got {ex.GetType().Name}: {ex.Message}");
            }
            throw new Exception($"Assert.ThrowsAsync failed. Expected {typeof(T).Name}, but no exception was thrown.");
        }
    }
}
