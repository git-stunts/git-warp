---
id: API_warpgraph-factory
blocks:
  - API_migrate-consumers-to-capabilities
blocked_by:
  - API_capability-interfaces
  - CROSS_shared-provider-interfaces
feature: api-capabilities
---

# Ship openWarpGraph() factory

Create `src/domain/WarpGraph.ts` with:

- `WarpGraph` interface (frozen object with capability namespaces)
- `openWarpGraph(deps)` async factory function
- Factory wires existing controllers to capability interfaces
- Returns `Object.freeze({ query, patches, materialize, ... })`

Initially wraps `WarpRuntime.open()` internally.
`WarpRuntime.open()` dies when `API_kill-warpruntime` ships.

## SSTS amendments

- **`WarpGraphDeps` is a named type** with documented, validated
  fields. `openWarpGraph` validates at the boundary: non-empty
  graphName, canonical writerId, persistence port present. Rejects
  with domain errors, not silent defaults.
- **No anonymous dep bags.** Every field on `WarpGraphDeps` has a
  named port type or value object type.
