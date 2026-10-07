# Public observed-Lamport regression: issue 957

Source base: `ceb58e656ec5bc85f0ae5991bf2a55599693bbb3` (v20.0.0).
The test uses public Runtime exports in fresh Node processes and independent CLI repair.
It uses the copied source package, not a registry-installed consumer. Packed-consumer validation remains required before completion.

[Lossless raw RED output](red.txt.gz) records the actual outcomes.
In SHA-1, writer a's tip is Lamport 21. Writer b observes A19, exits, and writes through a new process.
Writer b's published Lamport is 1. The assertion fails: expected 1 to be greater than 21.

In SHA-256, substrate-marker publication fails before any Lamport assertion.
The history adapter supplies a 40-digit null old OID to a SHA-256 repository.
Issue [#985](https://github.com/git-stunts/git-warp/issues/985) owns that prerequisite.
It is a separate bootstrap failure, not a Lamport RED witness.

## Reproduction

Run the copied source in the shared guarded Docker worker:

```sh
bash scripts/run-in-docker.sh node node_modules/vitest/vitest.mjs run test/integration/application/Runtime.observedLamport.integration.test.ts --maxWorkers=1
```

The command above executes inside the admitted container.
On the host, use the enforced project guard and canonical host/heavy-work plus host/docker/git-warp-tests/ reservation.
Do not use the host test process or bypass the Docker guard.

[Launch contract](red-launch.json) records the image, source archive hash, bounds, and command.
[RED resources](red-resources.json) records measured storage, backing free space, output, and guard outcome.
The worker uses COPY input, a read-only root, one owned build volume, and quota-limited temporary filesystems.
The build volume has a monitored 20 GiB bound; it is not a filesystem quota.
The runtime tmpfs quota is 3 GiB, within the project's aggregate 4 GiB data budget.
The owned container stops before its reservation releases. Dependency caches remain in the reusable owned volume.

## Validation limits

Both regression cases fail on the baseline for the distinct reasons above.
The new test and process fixture passed targeted ESLint in that same guarded worker.
[Lint resources](lint-resources.json) records that check's guard outcome.
No production fix, GREEN witness, coverage result, full-suite result, or approval is claimed.
The required unseen-concurrency, stale-CAS, and complete compatibility cases remain open.

Manual SSJS review of the new fixtures: no new domain concept; boundary checks at process input;
behavior stays in the fixture; no message-text branching; no domain time or entropy; no trust casts.

The archived output retains the exact original bytes, including terminal escape sequences and trailing newlines.
Raw output SHA-256: `4df865a1583a95a84ccac89c06d73bdbea6f84d1ae46a6bae474b78ac9dedfd5`.

Public JSON receipts replace the guest home mount label with `<CONTAINER_HOME>` to satisfy the path policy.
Each records the original receipt SHA-256. Raw JSON remains preserved in the owned run-evidence store.
The normalization changes no numeric result, command, limit, source digest, or guard outcome.

## Coherent observation candidate

The candidate implements the selected custody mechanism on prerequisite 83c4b2cf51d60ed736797d90d371c08b2158e3eb. Public live writes inspect immutable captured writer heads, merge their actual contexts and membership dots separately from clocks, and record the exact frontier in additive optional Patch metadata inside the same publication. Cached membership removals retain their selected snapshot frontier; new foreign additions remain concurrent. Strands keep their existing selected basis. Legacy imperative callbacks retain lazy state access. No historical EventId, schema interpretation, LWW tie-break or writer-parent topology is rewritten.

Metadata is validated at adapter decode and domain constructors; a published clock must safely exceed its recorded observations. Invalid metadata/identity/history and unsafe observed clocks return the existing public typed refusal without publication. Unrelated operational/programmer errors remain errors. Native journal decoding and sync normalization preserve the protected metadata. BTR signing stays on its existing canonical projection and original source SHA; it does not pretend to carry the full observation record. Legacy data without the optional field retains its old encoded shape.

The extended regression uses separate processes for seed, observation, each restarted write and reading, plus independent CLI repair. In both object formats the authoritative journal verifies saved frontier and context, and a further restarted write preserves inherited context and its own immutable predecessor. Three independent repositories/writers have Lamport 2 and separate contexts; two receivers fetch them unforced in opposite orders and materialize the same deterministic LWW winner. The test uses native Git fixture setup because the plumbing API deliberately excludes porcelain fetch.

RED red-957-current-v1 explicitly substitutes nine unchanged existing production blobs from the CAS prerequisite, hashes each baseline input in its launch record, and retains the new fixtures/support classes. This is an identified mixed regression snapshot, not a pristine full checkout. Both starvation cases fail at expected 1 greater than 21, and both metadata cases fail at absent observation. The same final fixtures pass on the candidate.

GREEN replicas-957-v4 passes lint, source/test types and all 31 selected cases: four real-process/replica integrations, 12 public write classification cases and 15 removal cases. Earlier focused-957-v6 passes 68 cases across seven files, lint and source/test types. full-unit-957-v2 completes all six stable shards: 8716 passing tests and two existing skips. The raw shard totals are 304 + 988 + 910 + 3144 + 2119 + 1251. Nested runner-probe fixtures in the scripts shard are not additional top-level suite tests.

Failed diagnostics remain failures: focused-v1/v2 stopped at two fixture type errors; v2 also followed a failed refinement-script parse before those edits applied. focused-v3 passed 33 cases but failed three lint rules; v4 passed 65 cases and failed an inconsistent empty-history fixture; full-unit-v1 stopped at an over-specific source-text return assertion. Replica-v1 used the wrong plumbing API for porcelain fetch; v2 stopped at a nullable getter type; v3 stopped at a yield-less failed-stream fixture. Each correction is visible in later source and receipts. No refusal was bypassed, test-isolation flag disabled or gate threshold raised.

All phases reuse the single COPY-based worker/image/build volume, Node22 toolchain, canonical workstation locks and unchanged enforced runtime quota/CPU/memory/PID/time limits. Build storage is monitored against 20 GiB, not quota-backed. Runtime data stays on the existing 3 GiB tmpfs within the 4 GiB allocation; logs stay within 128 MiB, with 16 MiB per-phase output. Host/VM free-space guards and child/worker cleanup remain active. Every source snapshot is bound by archive SHA-256; source_base anchors the unchanged ancestor during uncommitted development, not a false clean-head claim. candidate-inputs.json binds owned source/test files at export. Public copies normalize only container home; archive and payload hashes have separate scopes.

Remaining: full integration and coverage, complete edge/cancellation and exact same-writer race acceptance, package/consumer/performance checks, independent current-head review and hosted PR gates. The candidate is not yet review-ready. Mainline merging remains paused.

## Committed-candidate integration and coverage

At source 66f7a21eca29381a6cb2afa2830ecd290d3dbaf4, integration-957-v1 completes 183 cases (163 general plus 20 content-attachment). coverage-957-v1 completes the entire 825-file selected manifest with zero errors, reporting 27983/29746 covered lines (94.07%) against the unchanged 93.48% gate. The run is report-only; no coverage ratchet changes. Raw output and all touched-file metrics are adjacent. The observation basis constructor reaches 90.90% lines; several existing/touched modules also have uncovered branches. These are open verification work, not silently treated as 100% refactor coverage.

The coverage run peaks at 176 tasks, 1921114112 build bytes, 223322112 runtime bytes including 174600192 coverage bytes, and 48185344 other generated bytes. PID/OOM counters remain zero. Runtime output is discarded only after receipts and summaries are exported; the worker stops before lease release. Mainline merging remains paused. Full PR readiness is still unproven.

## Forced predecessor race and constructor refusals

edges-957-v2 passes 40 cases with lint and test types. Two real Runtime instances are forced to capture the same absent writer predecessor before either can proceed. In both formats exactly one write publishes and one returns a typed obstruction; the authoritative winner contains one operation and no fabricated own predecessor. The test adapter instrumentation delegates to the real implementation and is restored in finally. Constructor tests reject unconstructed observation/context values and a malformed direct Patch frontier.

graph-guard-957-v1 passes 46 cases with lint and test types, including wrong-graph refusal before native publication and on asset decoding. edges-957-v1 stopped at a missing explicit this type in test instrumentation; it was not a runtime failure or pass.

coverage-diagnostic-957-v1 is a targeted instrumented measurement: all 311 selected tests pass, but its 93.25% selected-file line result fails the unchanged 93.48% threshold. No threshold was lowered. Exact uncovered statement coordinates remain in the log. This is separate from the complete manifest's 94.07% pass. New constructor/graph paths now have meaningful tests, but final full coverage and required touched-refactor coverage remain unproven. Earlier candidate-input hashes applied to their export snapshot; this snapshot refreshes the four changed test inputs while production inputs remain unchanged.
