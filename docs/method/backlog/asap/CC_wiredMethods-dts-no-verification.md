# _wiredMethods.d.ts has no compile-time or runtime verification

**Effort:** M
**Audit ref:** Comparison report, hidden finding #3

`_wiredMethods.d.ts` (708 LOC) declares 60+ method signatures for
methods that exist only via `Object.defineProperty` wiring at runtime.
TypeScript trusts this file unconditionally. If a controller method
changes its signature and this file isn't updated:

- tsc reports SUCCESS (the `.d.ts` still says the old signature)
- IDE shows wrong parameter types
- Consumer code compiles cleanly
- Runtime throws at the call site

This is worse than JavaScript's honest silence — it's a confident,
typed, compiler-approved lie. There is no test, no CI check, and no
runtime assertion that verifies these 708 lines match reality.

## Suggested Fix (interim, before API_kill-warpruntime)

Add a type-level conformance test:
```ts
// test/type-check/wired-methods-conformance.ts
import type { WarpRuntime } from '../../src/domain/WarpRuntime';

// Assert WarpRuntime (with wired methods) satisfies each capability
type _q = WarpRuntime extends QueryCapability ? true : never;
type _p = WarpRuntime extends PatchCapability ? true : never;
// ... all 9 capabilities
```

This catches signature drift at compile time. Add it to the
`typecheck:consumer` script so it runs in CI and preflight.
