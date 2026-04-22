---
id: DX_cross-path-equivalence-test-dsl
blocked_by: []
blocks: []
---

# Cross-path equivalence as a general testing pattern

The JoinReducer `pathEquivalence.test.js` applies the same input
through N code paths and asserts identical output. This generalizes:

- Serialization round-trips
- Checkpoint save/restore vs fresh materialize
- Sync request/response vs local materialize
- Incremental vs full reduce

A possible test DSL is:
`assertPathEquivalence(input, [pathA, pathB, pathC], comparator)`.
