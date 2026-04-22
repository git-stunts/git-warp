---
id: OWN_materialize-requires-empty-options
blocked_by: []
blocks: []
feature: tooling-release
release_home: v17.0.0
---

# materialize() requires empty options object — DX friction

**Effort:** S
**Audit ref:** CQ01-1.1

`graph.materialize.materialize({})` requires an empty options object.
A consumer calling `graph.materialize.materialize()` with no args gets
a type error. This is a minor DX paper cut — the most common case
(materialize with defaults) should be the easiest to write.

## Suggested Fix

Add a default parameter or overload so the options object is optional:
```ts
async materialize(opts: MaterializeOptions = {}): Promise<MaterializeResult>
```
