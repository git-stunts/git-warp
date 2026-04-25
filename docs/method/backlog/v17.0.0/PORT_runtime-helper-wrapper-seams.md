---
id: PORT_runtime-helper-wrapper-seams
blocked_by: []
blocks: []
feature: runtime-boundaries
---

# Replace runtime helper wrappers with narrower seams

After the consumer migration closes, the remaining helper residue is mostly
runtime-shaped wrappers:

- `RuntimeDetachedFactory`
- `RuntimePatchCollector`
- `RuntimeStateStore`
- related capability/helper types that still name `WarpRuntime`

This task is to replace those wrappers with narrower seam contracts so the
remaining runtime deletion does not have to drag their type surfaces along with
it.

Cycle `0068` satisfied this cut:

- detached read surfaces now use explicit helper contracts instead of
  `WarpRuntime`
- `RuntimePatchCollector.ts` and `RuntimeStateStore.ts` now depend on narrow
  host shapes
- the runtime-kill umbrella no longer waits on this successor
