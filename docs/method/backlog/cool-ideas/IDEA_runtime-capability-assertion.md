# Runtime capability assertion in openWarpGraph()

Instead of 9 `as unknown as` casts in the capability bag construction,
verify at runtime that the methods actually exist on the runtime
object before exposing them as capabilities.

Pattern: `assertCapability<T>(obj, ['method1', 'method2'])` — checks
that each method exists and is callable, then returns the typed
object. Converts silent cast-cosplay into a fail-fast invariant check.

This improves both DX (better error messages when wiring is wrong) and
IQ (compiler-invisible bugs become runtime-visible).
