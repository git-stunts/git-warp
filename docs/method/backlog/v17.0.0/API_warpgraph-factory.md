---
id: API_warpgraph-factory
blocks:
  - API_migrate-consumers-to-capabilities
blocked_by: []
feature: api-capabilities
---

# Ship openWarpGraph() factory

Create `src/domain/WarpGraph.ts` with:

- `WarpGraph` interface (frozen object with capability namespaces)
- `openWarpGraph(deps)` async factory function
- Factory wires existing controllers to capability interfaces
- Returns `Object.freeze({ query, patches, materialize, ... })`

The old runtime host class died in the runtime-kill chain, which closed in
cycle `0084`.

## SSTS amendments

- **`WarpGraphDeps` is a named type** with documented, validated
  fields. `openWarpGraph` validates at the boundary: non-empty
  graphName, canonical writerId, persistence port present. Rejects
  with domain errors, not silent defaults.
- **No anonymous dep bags.** Every field on `WarpGraphDeps` has a
  named port type or value object type.
