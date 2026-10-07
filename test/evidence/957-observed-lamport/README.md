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
On the host, use the enforced project guard and concrete host/docker/git-warp-tests/ reservation.
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

## Publication failure contracts

failure-contract-957-v3 passes four tests, targeted lint, and source/test types. A recognized parent with undecodable publication metadata refuses before journal admission. A missing journal refuses before CAS. Success callbacks throwing Error or a non-Error value cannot erase the journal's acknowledged publication result. The recording journal is an acknowledgement fixture: these unit tests assert the returned SHA, journal request, target ref, and warning; they do not establish real Git durability. The real Git stale-writer witness remains the separate two-format integration.

failure-contract-957-v1 stopped at a missing LoggerPort child method. v2 passed two cases and failed two assertions that incorrectly treated the recording journal as a ref-publishing adapter. v3 supplies the complete port and asserts the fixture's actual acknowledgement contract. These failed runs remain preserved. Production code has not changed since 66f7a21eca29381a6cb2afa2830ecd290d3dbaf4. Required touched-refactor coverage, packed-consumer checks, and current-candidate independent approval remain open; this is not a ready-PR claim.

## Published draft and review remediation

[Draft PR #989](https://github.com/git-stunts/git-warp/pull/989) was published at 89a453c5c1c4c6fc7fcc29bc0dbf23de40f94b05 against the #986 feature base. Its real pre-push hook passes all static gates and 8723 top-level unit tests, with two existing skips (304 + 990 + 910 + 3144 + 2124 + 1251). The optional host link checker was unavailable and skipped; no link-check pass is claimed. Main-target CI workflows do not run on this stacked base. CodeRabbit does not review non-default targets. Neither skipped checks nor the issue-reference pass establish full hosted validation.

packed-957-v1 installs the actual candidate tarball into an independent container consumer and uses package-specifier child processes plus the installed CLI. SHA-1 and SHA-256 each retain the value after restart and independent repair: observed clock21, published22, restarted23. The packed archive SHA-256 is 85b5fba1caeddfbd97e326a458509e1bd198cf48a24f7168d497127426332a1f. Payload gates report 749917 compressed bytes, 3272400 unpacked bytes and 980 entries against unchanged limits760000,3300000,1050. This is a local candidate artifact whose metadata remains20.0.0, not a registry or new release claim. packed-compat-957-v1 passes the existing installed-artifact smoke, including strict installed type surfaces, public/private imports, CLI/hook/migration paths, removal and attachment contracts.

The full independent feedback is filed/intact in Reader and preserved here. [The reconciliation and next-step plan](agy-review-resolution.md) separates accepted fixes, the disputed arbitrary writer cap, later evidence and report qualifications. No fresh-head approval is claimed.

clock-red-957-v1 uses unchanged candidate production code plus added boundary tests, and fails three assertions with31 passes. clock-green-v1 stops at the constructor complexity gate (6 against5); it does not execute the acceptance cases. The clock behavior now belongs to a pure private method on ObservedWriteBasis. clock-green-957-v2 passes lint, source/test types and62 selected cases including6 real Git integrations. The prepared public clock refuses the boundary before journal publication, while legacy Patch interpretation remains unchanged.

lifecycle-capsule-957-v1 keeps the host review checkout frozen and explicitly adds the future7-case fixture to the copied guest source through its recorded command. Its exact UTF-8 fixture SHA-256 is11733893dc8111035a5ec37b614abf4db93d1ef5f041edd28dda66020087b73c; the same bytes now form ObservationLifecycle.test.ts. This capsule is not a claim that the fixture existed in its original source archive. It passes source/test types, targeted lint and7 tests. ordinary-writers-957-v1 passes22 basis tests, source/test types and lint, including a1025-writer head-call/cleanup witness. It does not measure native Git latency or universal memory bounds.

coverage-diagnostic-957-v2 passes320 selected tests and94.24% lines. v3 passes330 selected tests and95.72% lines. Both retain the unchanged93.48% threshold and report exact missing statement coordinates; neither rewrites the ratchet. The adjacent per-file summaries separate coverage dimensions. Several touched modules remain incomplete, so the refactor slice and PR readiness remain open.

All task-owned validation workers stop before releasing the concrete worker reservation. The current reusable build allocation is approximately1.96GB, within the monitored20GiB budget; the largest new packed runtime phase peaks at84779008 bytes within the existing3GiB tmpfs quota. No new image, worker, volume or bypass was introduced. Source archives and separately normalized/public payload hashes retain their exact scopes. Earlier canonical workload-lock reservations are historical; the user's current policy reserves only concrete shared resources and exempts ordinary edits/commits in an owned isolated worktree.

Manual SSJS review for the clock correction and property documentation: behavior stays on the validated runtime owner; constructors and clock checks perform no I/O; parsing remains at boundaries; no message-text branching; no ambient domain time/entropy; no trust casts or new shape aliases. Required final coverage, full stable-head gates, cost evidence and independent approval remain open.

## Complete touched coverage and capability truth

coverage-diagnostic-957-v8 passes 362 cases in 28 selected files, targeted lint, and source/test types. All sixteen production files in its instrumented set reach 100% lines (826/826), statements (864/864), functions (182/182) and branches (556/556), with no threshold change. The adjacent per-file summary includes every production file changed by #957. This closes the touched-code coverage requirement; it does not replace the full manifest, full integration, packed-consumer refresh, native cost witness or exact-head independent review.

New contract tests verify authoritative asset loading and mixed legacy/observed writer-chain ordering, divergence refusal, absent journals, missing admission/evaluation evidence, preserved acknowledgement with recovery evidence, absent stale-frontier witnesses, and node/edge content owner handling. RecordingPatchJournal remains an acknowledgement fixture, not native Git durability. In-memory semantic journal tests separately exercise actual asset encoding/decoding, bundle publication/ref movement and retained history traversal through the fixture implementations.

The touched PatchController had a no-op assertion that promised configuration methods without checking them. controller-red-v3 passes four contracts and fails the missing-capability case with a wrapped raw TypeError. Runtime read/write checks now run only when the corresponding fallback capability is needed. Explicit writer identities require neither method; a stored identity works with a read-only extension; absence of a needed setter remains CONFIG_WRITE_FAILED and absence of a needed getter remains CONFIG_READ_FAILED, with a typed E_MISSING_CONFIG cause. The outer failure codes and supported explicit/read-only behavior are preserved.

controller-red-v1 stops at a deliberate-null test assignment lacking ts-expect-error; v2 stops at a test restoration variable in the wrong scope. These are fixture type failures, not behavioral RED. v3 provides the actual missing-capability RED. The first runtime guard checked both methods together; controller-green-v1 passes69 cases, but a later read-only extension control produces controller-red-v4 (five passes, one failure). Separating read and write checks preserves that valid existing workflow. controller-green-v2 passes70 cases; v3 passes74. The final selected coverage run includes ten new controller contracts, including non-callable methods, absent cached membership, logging injection and unchanged property joins. No source/test policy was bypassed.

Native journal range and bundle assembly now iterate their private dense arrays directly. Range reversal preserves chronological order; attachment enumeration preserves sorted deduplication and zero-padded member names. Removing impossible undefined entries makes the runtime model honest and retains existing ordering/identity assertions. The prior NodeAdd test assertion is replaced by instanceof narrowing.

coverage-v4 has347 passes and99.14% selected lines. v5 has354 passes and99.87%; v6 has356 passes and99.87%. v7 has361 passes and one failed test: the test demanded an undefined cause property when the domain error correctly omitted that property. No coverage report was produced after this failed run. v8 asserts absence and passes362 cases with100% in every measured dimension. These are separate historical snapshots with raw source archive identities, not retroactively relabeled as the final head.

The real pre-push hook at published source2d00f0d8c4b141bbe80876181dd283125cc6618c passes all static gates and8734 top-level unit cases plus two existing skips. Its receipts are now retained here. Later source/test refinements remain pending the refreshed full chain and publication. Mainline merging remains paused and #989 remains draft. All owned workers stop before reservations release; build peak remains approximately1.96GB and the final selected runtime phase peaks at29589504 bytes, within existing enforced budgets.

Manual SSJS review: runtime-backed immutable observation values; adapter-owned parsing; owning-type clock validation and real capability checks; no message-text behavior branching; no new ambient domain time/entropy; no casts or fictitious shape assertions on changed paths. This checklist is distinct from the remaining independent review gate.

## Refined committed candidate integration

At a64e741b4c763819337976eceb1024d0e9c4bfa3, integration-957-v2 passes all185 integration cases:165 general plus20 attachment cases. This includes the six two-format observed-clock/restart/replica/stale-writer tests after the configuration capability checks and dense journal traversal refinement. The guard reports build peak1959239680 bytes, runtime peak17543168 bytes and83 tasks, with no refusal/PID/OOM event. The owned worker stopped before reservation release. Stable full coverage, packed refresh, native cost evidence and fresh review remain separate open gates. Mainline merging remains paused.

## Native cost discovery and refreshed validation

At production head `135e023c4e6934e713758da18f56d0de38e67fa9`, `coverage-957-v2` completes the 830-file curated coverage manifest: 8975 passed cases, two existing skips, zero errors; 28024/29754 covered lines (94.18%) against unchanged 93.48%. It is report-only and does not change the ratchet. `packed-957-v2` completes installed-artifact observed-write checks in both object formats and payload/type gates. Its copied source archive includes the then-uncommitted diagnostic fixture; this is not a pristine-tree claim.

The native cost fixture is now retained with its failures. `native-cost-957-v1` stopped at an invalid named RuntimeHost import. Corrected v2 and v3 pass source/test types and lint, and pass four native cases (1/16 seeded writers in both formats). Both 64-seed cases successfully capture/write a new patch but fail separate CLI repair at 65 total heads with the git-cas publication parent bound. Those are failed acceptance cases, not successful end-to-end performance witnesses. Issue #990 owns the independent checkpoint defect. No arbitrary fixture reduction or writer cap is introduced.

Full feedback on #990's proposed remedy is preserved in Reader receipt `8325c260-27ed-46b1-aba2-272374a9b7e8` and the issue comment. It requested changes; the candidate's native checkpoint repair and final-head review remain open. Mainline merging remains paused.

## Checkpoint-repair feature integration

Feature merge `aa9bb4f5` combines the independently owned #990 repair with #957; main remains untouched. The only textual conflict was the changelog, resolved by retaining both entries. Checkpoint/history/provider-double blobs match the incoming #990 source exactly.

`checkpoint-stack-957-v1` passes source/test types and 22 native cases across three actual files: six cost cases, six observed-write/restart/replica cases and ten checkpoint/primitive cases. All unchanged 64-seed cases now complete the fresh public write, independent CLI repair and independent reading in SHA-1 and SHA-256. The command additionally names a nonexistent replica-file filter; it selected no extra file and contributes no tests. Replica cases live in the observed-Lamport integration file.

The adjacent six-case summary retains actual measured capture/write times, head/asset counts, process-lifetime maximum RSS and sampled heap. These are a bounded native pilot, not universal timing or allocation guarantees. At 64 heads, exactly 64 immutable heads and assets are inspected, with no observed history-scan calls. The fixture preserves its original assertions and size. Runtime/data peaks remain within the same enforced worker budgets; no limit or threshold was relaxed. Fresh full gates, published stack state, hosted CI and final-head review remain required.
