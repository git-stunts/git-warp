# User-Supplied Resilience Policies via Alfred

## Idea

Replace scattered per-method failure options (`timeoutMs` on `syncWith`,
etc.) with a pluggable **resilience policy** injected at `open()` time.

The policy governs all fallible operations uniformly:
- Timeouts (per-operation class, not per-call)
- Retries (count, backoff strategy)
- Circuit breaking (failure thresholds, recovery windows)
- Backpressure (what to do when a stream consumer is slow)
- `onFailure` hooks (logging, telemetry, user-defined recovery)

## Shape (sketch)

```js
const graph = await WarpApp.open({
  persistence,
  graphName: 'events',
  writerId: 'node-1',
  resilience: {
    sync: { timeout: 5000, retries: 3, backoff: 'exponential' },
    materialize: { timeout: 30000 },
    patch: { timeout: 10000 },
    onFailure: (err, context) => logger.warn(err, context),
  },
});
```

## Why

- `timeoutMs` on `syncWith()` is the only failure-mode option today.
  Every other operation fails with no user control over timeout or retry.
- Alfred already manages lifecycle policies (GC, checkpointing). Failure
  resilience is the same category: operational policy that varies by
  deployment, not domain logic.
- A port-based design (`ResiliencePolicyPort`) lets Alfred provide smart
  defaults while letting users override per-operation-class.

## Prior art

- `gcPolicy` and `checkpointPolicy` on `WarpRuntime.open()`
- Polly (C#), resilience4j (Java), cockatiel (JS) — all use composable
  policy objects for timeout/retry/circuit-breaker
