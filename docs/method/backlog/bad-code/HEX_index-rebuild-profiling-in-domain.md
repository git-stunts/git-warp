---
id: HEX_index-rebuild-profiling-in-domain
blocked_by: []
blocks: []
feature: tooling-release
---

# IndexRebuildService has 5 performance.now() calls for profiling

**Effort:** S

`IndexRebuildService.js` uses `performance.now()` at 5 sites to
measure rebuild and load durations. This is monotonic duration
measurement — instrumentation, not causality — living inside a
domain service.

Violates `no-ambient-time` invariant. Profiling inside deterministic
services is how ambient state spreads like mold.

## Suggested fix

Move timing to an observability wrapper or profiler adapter. The
service returns facts (node count, shard count). The caller or an
adapter wraps the call with timing and emits telemetry:

```javascript
// Instead of timing inside the service:
const t0 = profiler.start();
const treeOid = await indexService.rebuild(ref, opts);
profiler.end(t0, 'index.rebuild', { treeOid });
```

The domain service stays pure. The profiler stays in infrastructure.
