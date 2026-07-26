# v19 Materialization Performance Contract

This directory defines the versioned measurement contract for v19
materialization work. It currently covers issue
[#759](https://github.com/git-stunts/git-warp/issues/759):

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

## Local use

Build once, then measure and evaluate:

```sh
npm run performance:measure -- --output .performance/head.json
npm run performance:gate -- \
  --head .performance/head.json \
  --policy benchmarks/v19/policy.json
```

Use `GIT_WARP_PERF_RUNS`, `GIT_WARP_PERF_WARMUPS`,
`GIT_WARP_PERF_BASE_NODES`, `GIT_WARP_PERF_INCREMENTAL_NODES`, and
`GIT_WARP_PERF_PROPERTY_BYTES` only for local calibration. A base/head CI
workflow and durable history are tracked separately by
[#761](https://github.com/git-stunts/git-warp/issues/761). The oversized streamed
Observer proof is tracked by
[#760](https://github.com/git-stunts/git-warp/issues/760) and is intentionally
not claimed by this materialization harness.
