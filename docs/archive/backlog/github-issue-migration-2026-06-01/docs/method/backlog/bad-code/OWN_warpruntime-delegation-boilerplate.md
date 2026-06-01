---
id: OWN_warpruntime-delegation-boilerplate
blocked_by: []
blocks: []
feature: runtime-boundaries
release_home: v17.0.0
---

# WarpRuntime's 10 Object.defineProperty blocks should be a shared helper

**Effort:** S

10 identical `Object.defineProperty` loops (230 lines) delegate
~80 methods across 10 controllers. Each block is 16-18 lines with
identical structure. The pattern:

- Breaks IDE "Go to Definition" (methods defined dynamically)
- Cannot be type-checked by tsc (signatures unknown statically)
- 230 lines of pure boilerplate

## Suggested fix

Extract a single `delegateMethods(target, controllerField, names)`
helper. Reduces 230 lines to ~30. Add a `.d.ts` overlay declaring
all delegated methods on WarpRuntime for IDE support.
