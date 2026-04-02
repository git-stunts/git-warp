# Cross-path equivalence as a general testing pattern

The JoinReducer `pathEquivalence.test.js` applies the same input
through N code paths and asserts identical output. This generalizes:

- Serialization round-trips
- Checkpoint save/restore vs fresh materialize
- Sync request/response vs local materialize
- Incremental vs full reduce

Could be a test DSL:
`assertPathEquivalence(input, [pathA, pathB, pathC], comparator)`
