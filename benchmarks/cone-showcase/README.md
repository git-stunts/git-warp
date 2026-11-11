# Cone showcase process witness

This witness reports actual Git process counts for a deterministic margins
workload. It writes through `Warp` and reads through `Runtime.open`,
`runtime.lane`, and `Lane.observe`. The independent corpus checks the exact
thread and comment membership returned by each warm and cold read. Issue #1052
owns the later port to the Optic read path.

Run from the repository root through the COPY-based Docker entry point:

```sh
bash scripts/run-in-docker.sh node benchmarks/cone-showcase/ConeShowcaseWitness.ts 200
bash scripts/run-in-docker.sh node benchmarks/cone-showcase/ConeShowcaseWitness.ts
```

`npm run benchmark:cone-showcase -- 200` runs the same pilot command.

The first command is the 200-thread pilot. With no arguments, the witness runs
200 and 2,000 threads. Explicit arguments can select either scale once. Invalid
arguments exit with status 2 before scratch creation or Git startup. There is
no 20,000-thread mode.

Each scale uses three writers, ten initial threads per document, and one initial
comment plus two replies per thread. After bulk loading, it performs 60 saves,
30 warm margins reads, and five cold reads. A fixed seeded generator chooses
the measured operations. Timing does not decide correctness.

## Count contract

A private global Git configuration is passed only to the scale child. It asks
Git to create one Trace2 event file per Git process. Each sample counts new file
identities since the previous sample. This includes Git descendants that inherit
the configuration. It excludes unrelated Node and shell starts. An OS failure
to start Git contributes no file; a started Git process that returns nonzero
still counts.

A long-lived Git session counts in the first sample where its file appears.
Later requests on that session can have a zero process count. The witness does
not count API calls, infer process counts from timings, or parse Trace2 JSON.
Calibration tests check real command results and known invocations, including
session reuse, failed startup, rejected arguments, nonzero exit, unrelated
processes, and configured descendants.

The sampler rejects missing directories, discarded output, nonregular or aliased
files, empty files, incomplete final records, and disappeared or replaced file
identities. The per-lifecycle reserve is 71,680 files and 560 MiB of logical or
allocated file bytes, checked at each sample. Git also receives a 71,679-file
limit, leaving a slot for its discard marker. The reserve is twice the largest
measured lifecycle: 184 writes at the 2,000-thread scale, at most 194 Git
processes per write in the 200-thread pilot, and 8 KiB per trace file. The outer Docker guard bounds
growth during operations; the sample checks are not a filesystem quota.

Sample records are retained before cleanup. Trace files remain while a warm
session can hold them open. Cleanup follows awaited `Warp.close`,
`Runtime.close`, or normal cold-child completion. Failed or killed children
leave scratch to the outer worker's stop boundary. No elapsed-time assumption
authorizes cleanup.

## Output and completion

Output uses newline-terminated TSV records. Fields in `sample`, `trace`,
`membership`, and `read-incomplete` records use URI percent encoding.

- `sample` records contain scale, sequence, phase, operation, document identity,
  subject identity, observed process count, outcome, and detail. A missing count
  is `-`, never zero.
- `trace` records retain the new filenames for that sample.
- `membership` records retain actual document, thread, and comment identities.
  `membership-end` records retain the document and thread count.
- `read-incomplete` retains the observer, status, and reason for unavailable
  reads. `sample-end` completes one sample record group.
- `aggregate` records derive sample count, measured count, minimum, nearest-rank
  median, maximum, and outcome totals for each workload phase.
- `scale-end` records contain `complete` or `incomplete`. A failed scale that
  cannot safely finish emits `scale-error` without a completion footer.

Cold children return a separate framed membership transport. Its parser checks
the exact version, document, outcome, membership identities, counts, and final
newline. The scale parent compares that actual membership with the same
independent corpus used for warm reads. A refused, malformed, missing, or
mismatched read cannot become a successful empty result.

Exit status 0 requires every planned sample, retained writes, successful setup
and close operations, actual counts, and verified read membership. Status 1
means incomplete or failed evidence. Counts have no invented performance
ceiling: issue #1041 owns performance limits. These criteria describe the
prepared implementation; the guarded pilot must establish its actual behavior.

The launcher bounds each scale child's output at 4 MiB, the 200-thread child at
15 minutes, and the 2,000-thread child at 25 minutes. A cold child has a
120-second and 64 KiB bound. These are resource limits, not timing oracles.
Use an explicitly budgeted worker for both scales; the default command may
need more wall time than a single pilot admission.
