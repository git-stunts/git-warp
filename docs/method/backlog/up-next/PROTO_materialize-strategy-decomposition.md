---
id: PROTO_materialize-strategy-decomposition
feature: materialization-query-index
blocked_by:
  - PROTO_materialize-integration
blocks: []
---

# MaterializeController strategy decomposition

**Effort:** L

## Idea

MaterializeController is 1,019 LOC — still a substantial class. The
materialize paths are actually 4 distinct strategies:

1. **Cold replay** — no checkpoint, all patches from scratch
2. **Incremental** — checkpoint + patches since
3. **Ceiling** — time-travel to specific Lamport tick
4. **Coordinate** — explicit frontier snapshot

Each strategy has its own cache semantics, provenance handling, and
subscriber notification behavior. They share the `_setMaterializedState`
+ `_buildView` pipeline.

The decomposition: a `MaterializeStrategy` interface with 4 implementations.
`MaterializeController.materialize()` selects the strategy based on
options/state, then delegates. Each strategy is its own file.

## Why cool

- Each strategy testable in isolation
- New strategies (e.g., "speculative fork replay") can be added without
  touching existing ones
- Aligns with P3: behavior belongs on the type that owns it
- The 1,019 LOC class becomes a 200 LOC orchestrator + 4 ~200 LOC strategies
