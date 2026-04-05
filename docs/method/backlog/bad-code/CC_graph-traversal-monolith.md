# GraphTraversal.js has 11 algorithms in 1617 LOC

**Effort:** L

## What's Wrong

`GraphTraversal.js` contains BFS, DFS, Dijkstra, A*, topological sort,
connected components, shortest path, all pairs, cycle detection,
reachability, and PageRank -- all in one file. Each algorithm is
internally cohesive but the file is a monolith with too many reasons
to change. Adding or modifying one algorithm risks breaking others.

## Suggested Fix

- One file per algorithm (or per algorithm family, e.g., shortest-path
  family: Dijkstra + A* + all-pairs).
- `GraphTraversal` becomes a dispatcher/facade that delegates to the
  individual algorithm modules.
- Each algorithm module exports a single function or small class,
  accepting a `NeighborProviderPort` for graph access.
