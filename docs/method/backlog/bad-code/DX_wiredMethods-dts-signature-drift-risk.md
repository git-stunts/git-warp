# _wiredMethods.d.ts has no automated verification against controllers

**Effort:** M
**Audit ref:** CQ01-4.5, SR01-I2

The 708-line `_wiredMethods.d.ts` hand-maintains method signatures for
60+ methods that exist only via runtime `Object.defineProperty` wiring.
It contains 30+ interface definitions duplicating types from across the
codebase.

If a controller method signature changes and this file is not updated,
TypeScript happily compiles code that will fail at runtime. This is a
type annotation without runtime backing — the exact anti-pattern SSTS
Rule 0 warns against.

## Suggested Fix (interim, before API_kill-warpruntime)

Add a type-level test that asserts `WarpRuntime` (with wired methods)
satisfies all 9 capability interfaces:
```ts
// test/type-check/wired-methods.ts
import type { WarpRuntime } from '../../src/domain/WarpRuntime';
type _assert = WarpRuntime extends QueryCapability ? true : never;
// ... for all 9 capabilities
```

This catches signature drift at compile time.
