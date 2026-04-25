---
id: SUB_toposort-full-adjacency
blocked_by: []
blocks: []
feature: materialization-query-index
release_home: v20.0.0
---

# topologicalSort always materializes full adjacency

**Effort:** M

## Problem

`GraphTraversal.js` `topologicalSort()` (~line 693) unconditionally
builds `adjList: Map<string, string[]>` AND
`neighborEdgeMap: Map<string, NeighborEdge[]>` for every reachable
node. Both structures hold the full edge set in memory (O(V+E)). The
`_returnAdjList` flag only controls whether `neighborEdgeMap` is
*returned* — it's always *built*.

For callers that only need the sorted order, this is wasted memory.
Root cause behind `levels()` and `transitiveReduction()` inheriting
full-graph materialization from their `topologicalSort()` call.

## Possible fix

Split topo sort into two modes: lightweight (in-degree counting only,
no adj list caching) and current mode (full caching for callers that
need it). Or: make the Kahn phase re-fetch from provider, relying on
LRU neighbor cache for amortization.
