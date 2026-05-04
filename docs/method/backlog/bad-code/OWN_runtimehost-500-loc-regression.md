---
id: OWN_runtimehost-500-loc-regression
blocked_by: []
blocks: []
feature: runtime-boundaries
release_home: v17.0.0
---

# RuntimeHost is back over the source file size ceiling

**Effort:** L

## What's Wrong

`src/domain/RuntimeHost.ts` is 917 LOC, above the repo's 500 LOC source
limit. The file owns composition, controller wiring, materialization,
read cache state, adjacency/provider construction, subscriptions,
provenance, checkpoints, GC, and runtime delegation.

The file size is a symptom of mixed ownership. It keeps encouraging
controllers to depend on host internals.

## Suggested Fix

Split read-model ownership first. Extract cached-state, state-dirty,
materialized-graph, adjacency, and state-hash behavior behind an
explicit read-basis/read-model owner. Then continue with smaller
ownership slices until `RuntimeHost.ts` returns under the source LOC
limit without moving sludge into generic helper files.
