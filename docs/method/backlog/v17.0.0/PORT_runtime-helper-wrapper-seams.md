---
id: PORT_runtime-helper-wrapper-seams
blocked_by: []
blocks:
  - API_kill-warpruntime
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
