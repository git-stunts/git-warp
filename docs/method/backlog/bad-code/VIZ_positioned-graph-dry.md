# PositionedGraph types duplicated across 4 files

**Effort:** S

## What's wrong

`PosNode`, `PosEdge`, and `PositionedGraph` typedefs are defined independently in `elkLayout.js`, `graph.js`, `svg/index.js` (and partially in `converters.js` as `GraphData*`). These are the contract between layout and rendering -- they should be defined once.

## Suggested fix

- Define once in a shared module (e.g., `src/visualization/types/PositionedGraph.js`).
- Per P1, consider promoting to lightweight classes if they carry invariants (e.g., non-negative coordinates, required fields).
- All layout and renderer modules import from the shared definition.
