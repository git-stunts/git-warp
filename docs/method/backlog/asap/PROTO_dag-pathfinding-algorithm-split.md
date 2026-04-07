# PROTO: DagPathFinding algorithm worker split

## Legend

PROTO — protocol/domain structural improvement

## Problem

`DagPathFinding.js` is smaller than the strand files, but it still
bundles multiple algorithms and helper responsibilities in one class:

- BFS path finding
- bidirectional BFS shortest path
- Dijkstra-style weighted shortest path
- A* search
- bidirectional A*
- forward/backward expansion helpers
- multiple path reconstruction helpers

That makes the class a poor rehearsal target for the later “Gods”
refactor: algorithm behavior, cancellation behavior, and reconstruction
logic are all coupled together.

It also contains a systems-style smell already tracked separately:

- raw `Error` in the constructor instead of a domain-specific error

## Proposal

Keep `DagPathFinding` as a small facade and extract algorithm workers:

- `BfsPathFinder`
- `BidirectionalBfsPathFinder`
- `DijkstraPathFinder`
- `AStarPathFinder`
- `BidirectionalAStarPathFinder`

Move the `_reconstruct*` helpers into a shared `PathReconstruction`
module or equivalent private helper module.

This gives us a smaller, low-risk rehearsal for the later breakup of
larger services.

## Sequencing

Recommended order:

1. Finish coverage on current `DagPathFinding` behavior first.
2. Lock the algorithms with known-answer tests.
3. Extract one algorithm worker at a time while preserving the public
   `DagPathFinding` surface.

This is the one file where tests and later refactor are tightly linked,
but they should still land in separate commits and ideally separate
cycles.

## Impact

- Clearer ownership per algorithm
- Easier reasoning about cancellation and no-path behavior
- A safer first rehearsal for post-coverage decomposition

## Related

- `docs/method/backlog/bad-code/CC_dag-pathfinding-untested.md`
- `docs/method/backlog/bad-code/PROTO_dag-pathfinding-raw-error.md`
