# v19 Materialization Performance Contract

This directory defines the versioned measurement contract for v19
materialization and bounded-observation work. It covers issues
[#759](https://github.com/git-stunts/git-warp/issues/759),
[#760](https://github.com/git-stunts/git-warp/issues/760), and
[#849](https://github.com/git-stunts/git-warp/issues/849):

| Scenario | Fixture posture | Required storage evidence |
|---|---|---|
| `cold-materialize` | Deterministic causal corpus with no retained materialization | Full replay followed by one retained result |
| `warm-materialize` | The same corpus with an exact retained materialization | Exact git-cas hit and zero patch replay |
| `incremental-materialize` | A retained base plus a bounded suffix patch chain | Compatible predecessor hit and bounded suffix replay |

The harness accepts `git-warp.performance.corpus/v1` and
`git-warp.performance.corpus/v2`. Both use the fixed seed `0x19c0ffee`, a
directed chain, one deterministic property per node, and an explicit bounded
suffix. Version 2 also records independent base and suffix patch counts, so
node payload volume cannot masquerade as causal-chain depth. Corpus version,
seed, topology, node and patch cardinality, and logical property bytes are
recorded in every result.

The checked-in base/head comparison emits version 2. Its 65-patch base crosses
the default 64-patch checkpoint interval, and its five-patch suffix makes the
incremental scenario a bounded tail rather than another full-history read.
Version 1 remains accepted for historical and ad hoc fixtures.

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
trustworthy wall-time gate. Peak RSS and heap have blocking absolute envelopes.
The checked-in policy combines a relative CPU ratio with an absolute noise
floor and reviewed materialization and streaming CPU/memory ceilings.

The reviewed CI corpus contains 65 base nodes in 65 patches, a five-node suffix
in five patches, and 256 property bytes per node. The earlier 1,500-node
bootstrap profile was rejected after one worker exceeded the ten-minute
timeout. The checked-in
[`calibration.json`](./calibration.json) records the replacement profile,
observed medians and dispersion, the exact GitHub-hosted Ubuntu 24.04/Node 22
gating environment, and the policy rationale. A local Apple Silicon calibration
is retained as secondary evidence, not as the source of CI ceilings.
The reference runner measured `781 / 30 / 372` Git commands and
`3920 / 890 / 2380` ms CPU for cold, warm, and incremental materialization.
The command ceilings are `900 / 35 / 430`, about 1.15 times the observed
structural counts.

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

To reproduce the CI comparison, build clean base and head worktrees and run:

```sh
npm run performance:compare -- \
  --base-directory ../git-warp-base \
  --head-directory . \
  --output-directory .performance/comparison \
  --order-seed 1
npm run performance:gate -- \
  --comparison .performance/comparison/comparison.json \
  --policy benchmarks/v19/policy.json \
  --summary .performance/comparison/summary.md
```

Use `GIT_WARP_PERF_RUNS`, `GIT_WARP_PERF_WARMUPS`,
`GIT_WARP_PERF_BASE_NODES`, `GIT_WARP_PERF_INCREMENTAL_NODES`,
`GIT_WARP_PERF_BASE_PATCHES`, `GIT_WARP_PERF_INCREMENTAL_PATCHES`, and
`GIT_WARP_PERF_PROPERTY_BYTES` only for alternate local calibration. Omitting
both patch-count variables still emits a version 1 corpus. Use `--profile mini`
only for a fast mechanism check; it deliberately skips the hostile OOM control
and is not release evidence.

## CI comparison and history

The dedicated `Performance` workflow checks out the exact base and head SHAs
side by side, installs and builds both under the same pinned Node 22 toolchain,
and runs materialization in counterbalanced ABBA order. Each ref contributes
five measured samples and one warmup per scenario. The opposite ref runs first
for the streaming pair, reducing systematic order bias across the whole job.

Strict parsing and semantic validation happen before comparison. Missing
evidence, malformed distributions, cardinality failures, storage-evidence
failures, materialization memory overruns, streaming heap/RSS violations, and
CPU regressions all fail the check. Wall time and streaming latency/throughput
remain diagnostic.

## Published-v18 migrated-read release gate

The release gate also restores the checked-in 2 MiB
`v18-retained-substrate-medium-001` bundle under the exact published
`@git-stunts/git-warp@18.2.1` and `@git-stunts/git-cas@6.0.0` lock. It reads
all 16 `medium:document:000..015.ordinal` values on one pinned coordinate
through the v18 checkpoint-tail optic, migrates a separate restored copy once,
and performs the same retained scan through the v19 public Runtime, Lane,
generated-SDK construction surface, Reading, and Receipt path.

Fixture restore and the one-shot migration are excluded from steady-state
samples. Migration duration is reported separately. Cold and second-process
warm reads run from isolated copies in counterbalanced v18/v19 order. Every
sample records operation and worker wall time, CPU, heap, RSS, Git command
counts, the exact semantic value, and retained-basis evidence.
The report fails closed unless both runtimes produce 16 readings, checksum
`120`, and final value `15`, while v19 also completes its Receipt.
Operation-scoped CPU, heap, and RSS always come from the worker's timed
boundary. When GNU `time` is available, whole-process CPU and RSS are retained
in separate diagnostic fields and never replace the operation-scoped gate
inputs.

[`migrated-read-policy.json`](./migrated-read-policy.json) requires v19 to
improve median operation wall time by at least 20% and 100 ms, and to reduce
Git commands by at least 20%, for both cold and warm reads. CPU may not regress
beyond a 15% ratio outside a 100 ms noise floor; heap and RSS have 1.25×
ceilings. A v19-to-v19 no-regression comparison cannot satisfy this gate.

Every pull request and main push receives a Markdown job summary with
cold/warm/incremental, streaming, and migrated-v18 deltas. The workflow retains
the combined comparison, merged results, every raw batch, both streaming
proofs, the migrated-read report, and both summaries for 90 days under a
commit-addressed artifact name. The
[`history`](./history/README.md) page describes the browsable publication and
baseline-review contract. Release workflows for v19 and later refuse to publish
unless the release commit has a successful main-branch `Performance` run.
