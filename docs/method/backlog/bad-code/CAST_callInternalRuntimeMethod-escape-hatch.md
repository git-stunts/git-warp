---
id: CAST_callInternalRuntimeMethod-escape-hatch
blocked_by: []
blocks: []
feature: merge-strands-worldlines
release_home: v17.0.0
---

# callInternalRuntimeMethod is a runtime access-control escape hatch

## Smell

`src/domain/utils/callInternalRuntimeMethod.ts` uses `Reflect.get`
to call private methods on WarpRuntime from other domain code. It
exists because the architecture doesn't have proper ports between
domain components — so they reach into each other's private fields
via this escape hatch.

## Files

- `src/domain/utils/callInternalRuntimeMethod.ts`
- Used by: Worldline.ts, ComparisonSelector.ts, StrandController.js,
  StrandService.js, QueryController.js

## Fix

Dies when WarpRuntime dies. Each consumer gets the capability it
needs via typed injection. No need to bypass access control when
the API surface is honest.
