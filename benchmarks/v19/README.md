# v19 Performance Contract

The v19 performance gate protects four user-visible paths:

| Scenario | Contract |
|---|---|
| `cold-materialize` | Reconstruct a live lane with no retained materialization. |
| `warm-property-read` | Read one bounded property from a retained materialization 16 times. |
| `incremental-materialize` | Resume a retained materialization and apply a short suffix. |
| `bounded-memory-read` | Read from a logical graph at least four times larger than the V8 heap cap. |

GitHub Actions measures the pull request base and head sequentially on the same runner. The gate rejects CPU-time, wall-time, or bounded-memory RSS regressions beyond the ratios and noise floors in [`policy.json`](./policy.json). Absolute ceilings protect the bootstrap run and prevent a slow base from normalizing an unusable head.

On Linux, `/usr/bin/time` measures the complete worker lifecycle and descendant Git processes. The JSON result also records operation-scoped Git plumbing calls, whether patch replay occurred, whether the whole graph entered the runtime state cache, time to first reading, throughput, heap use, and maximum RSS. Non-Linux local runs use Node-process CPU and measured-operation wall time and are not directly comparable with Linux CI results.

The bounded-memory fixture is constructed outside the capped worker. The worker starts with a 48 MiB V8 old-space cap and reads a 256 MiB logical property corpus through one retained materialization. Passing requires a successful reading, no patch replay, no whole-state cache, at least a `4x` logical-graph-to-heap ratio, and no more than 256 MiB maximum RSS.

Run the measurement and policy locally with:

```sh
npm run performance:measure -- --output .performance/head.json
npm run performance:gate -- \
  --head .performance/head.json \
  --policy benchmarks/v19/policy.json
```

The `Performance` workflow publishes raw JSON, the rendered gate summary, and the exact policy as 90-day workflow artifacts. Repository rules must require the `CPU, wall-time, and bounded-memory gate` check before merging.
