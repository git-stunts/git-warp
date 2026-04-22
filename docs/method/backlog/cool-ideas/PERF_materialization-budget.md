---
id: PERF_materialization-budget
blocked_by: []
blocks: []
feature: sync-trust-security
---

# Materialization budget — O(P) with a ceiling

Materialization is O(P) where P is total patches. No upper bound.
No cancellation. A sync of a 10-year graph with no checkpoints is
an unbounded memory allocation.

What if materialization had a budget?

```javascript
const result = await graph.materialize({
  budget: {
    maxPatches: 50_000,
    maxMemoryMB: 512,
    maxDurationMs: 30_000,
    signal: abortController.signal,
  },
});

if (result.partial) {
  // Budget exceeded — result contains state up to budget limit
  // plus a continuation token for resuming
  const rest = await graph.materialize({
    continuation: result.continuationToken,
    budget: { maxPatches: 50_000, maxMemoryMB: 512 },
  });
}
```

The budget transforms materialization from "all or nothing" to
"progressive." Each budget window creates an intermediate checkpoint,
so progress is never lost. If the process crashes mid-materialization,
the next attempt resumes from the last checkpoint.

This also enables streaming materialization for the inspector:
show partial state as it builds, updating the UI in real-time.
The user sees the graph grow as patches are applied.

The continuation token is just a `(writerFrontier, checkpointSha)`
pair — resume from there next time.
