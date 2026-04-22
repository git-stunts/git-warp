---
id: PERF_streaming-graph-traversal
blocked_by: []
blocks: []
---

# Streaming GraphTraversal — async generators

Every traversal algorithm could offer a streaming variant:
`bfs()` -> `bfs*()`, `dfs()` -> `dfs*()`, etc. The current API
collects results into arrays, forcing O(V) memory even when the
caller only needs the first match, a count, or a pipeline.

`AsyncGenerator<string>` return type lets callers break early,
compose with other iterables, or pipe into backpressure-aware sinks.
The array-returning methods become sugar.

The tricky part is stats: can't return `{ nodes, stats }` from a
generator. Options: stats callback in hooks, generator `.return()`
value, or separate `statsForLastRun()` accessor.

Start with `transitiveClosure` as proof-of-concept, then generalize.
