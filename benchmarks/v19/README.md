# v19 Materialization Performance Contract

This directory defines the versioned measurement contract for v19
materialization and bounded-observation work. It covers issues
[#759](https://github.com/git-stunts/git-warp/issues/759) and
[#760](https://github.com/git-stunts/git-warp/issues/760):

| Scenario | Fixture posture | Required storage evidence |
|---|---|---|
| `cold-materialize` | Deterministic causal corpus with no retained materialization | Full replay followed by one retained result |
| `warm-materialize` | The same corpus with an exact retained materialization | Exact git-cas hit and zero patch replay |
| `incremental-materialize` | A retained base plus one bounded suffix patch | Compatible predecessor hit and bounded suffix replay |

The corpus format is `git-warp.performance.corpus/v1`. It uses the fixed seed
`0x19c0ffee`, a directed chain, one deterministic property per node, and an
explicit bounded suffix. Its version, seed, topology, cardinality, and logical
property bytes are recorded in every result.

## Timed boundary

Corpus generation, initial commits, retained-state preparation, and fixture
copying occur outside the measured worker. The operation wall clock begins
immediately before `RuntimeHost.materialize()` and stops when it resolves.
Operation-scoped Git plumbing calls and git-cas exact/predecessor evidence are
recorded alongside the semantic result.

On Linux, GNU `time` records worker-lifecycle user/system CPU and maximum RSS,
including descendant Git processes. On other platforms, Node records
operation-scoped process CPU and process memory. The result states which scope
was used, and base/head comparison rejects different platforms, architectures,
Node majors, Git versions, git-cas versions, or corpora.

CPU is the blocking regression metric. Wall time remains diagnostic because
hosted-runner scheduling and filesystem noise are not stable enough for a
trustworthy wall-time gate. The checked-in policy combines a relative ratio
with an absolute noise floor and also applies generous bootstrap ceilings.

## Semantic and schema gates

Every sample must prove exact node, edge, and property cardinality. Cold and
warm runs must produce the same SHA-256 semantic fingerprint. Warm runs must
show an exact git-cas hit with no replay; incremental runs must show a
compatible predecessor hit and suffix replay. Strict schema validation rejects
unknown, missing, malformed, and semantically incomplete result records before
any performance comparison.

## Oversized streamed Observer proof

`npm run performance:streaming` exercises the public many-Observer path under
an explicit V8 old-space limit. The proof profile persists 128 deterministic
descriptors through normal patches and the production v5 checkpoint/property
page path. Its decoder expands one 2 MiB logical value at a time, producing a
256 MiB result stream under a 64 MiB old-space limit: a reviewed 4× multiplier.

The worker consumes the real async iterator with a 2 ms delay after every
reading. It records exact cardinality, logical bytes, SHA-256 fingerprint,
time-to-first-reading, throughput, peak heap, peak RSS, receipt evidence,
property-page identities, and the maximum gap between planned and consumed
readings. The contract requires all 128 property pages, a planning lead of at
most one, a completed receipt, zero `RuntimeHost.materialize()` calls, and zero
whole-index scans.

Fixture generation never constructs the 256 MiB result. It persists small
descriptors in bounded batches and expands at most one logical value while
computing the expected fingerprint. The same bounded payload generator is used
by the worker. A hostile control runs under the identical old-space limit and
materializes every expanded result as heap-resident JavaScript character
arrays; the proof fails unless that child terminates specifically from memory
exhaustion.

## Local use

Build once, then measure and evaluate:

```sh
npm run performance:measure -- --output .performance/head.json
npm run performance:gate -- \
  --head .performance/head.json \
  --policy benchmarks/v19/policy.json
npm run performance:streaming -- \
  --profile proof \
  --output .performance/streaming.json
```

Use `GIT_WARP_PERF_RUNS`, `GIT_WARP_PERF_WARMUPS`,
`GIT_WARP_PERF_BASE_NODES`, `GIT_WARP_PERF_INCREMENTAL_NODES`, and
`GIT_WARP_PERF_PROPERTY_BYTES` only for local calibration. A base/head CI
workflow and durable history are tracked separately by
[#761](https://github.com/git-stunts/git-warp/issues/761). Use
`--profile mini` only for a fast mechanism check; it deliberately skips the
hostile OOM control and is not release evidence.
