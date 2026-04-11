# Ship openWarpGraph() factory

Create `src/domain/WarpGraph.ts` with:

- `WarpGraph` interface (frozen object with capability namespaces)
- `openWarpGraph(deps)` async factory function
- Factory wires existing controllers to capability interfaces
- Returns `Object.freeze({ query, patches, materialize, ... })`

Initially wraps `WarpRuntime.open()` internally. Boot logic migrates
here in a follow-up.
