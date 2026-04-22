---
blocked_by: []
blocks: []
id: PERF_streaming-materialization
---

# Streaming materialization with progressive state

Materialization currently collects all patches, reduces them, and
returns a frozen state. For large graphs this blocks until complete.

A streaming variant could yield partial state as patches are applied:

```typescript
for await (const progress of graph.materialize.stream({})) {
  // progress.patchesApplied: number
  // progress.partialState: WarpState (so far)
  // progress.complete: boolean
  renderProgressBar(progress);
}
```

This enables progress bars, incremental rendering, and early
termination for queries that only need partial state.
