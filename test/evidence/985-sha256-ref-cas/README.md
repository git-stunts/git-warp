# #985: absent-ref CAS in both Git object formats

Issue: [#985](https://github.com/git-stunts/git-warp/issues/985). Base: `ceb58e656ec5bc85f0ae5991bf2a55599693bbb3`, verified remote main and peeled v20.0.0. The peeled v19.1.0 commit is an ancestor; v20.0.0 contains 472 additional commits.

## Diagnosis and candidate

The adapter validates SHA-256 targets but sends a 40-digit zero old OID for absent-ref creation. Git refuses that argument before SubstrateVersionGate can publish the initial marker. Git documents an empty old value as an absent-ref expectation, independent of object format: [git-update-ref](https://git-scm.com/docs/git-update-ref).

The candidate passes an explicit empty argument when the expected ref is absent. It preserves expected-old replacement, deletion, direct non-retrying CAS execution, errors, and abbreviated target support. Inferring width from the target spelling would break abbreviated targets. No Lamport production code changes belong in this slice.

Two adapter option interfaces become transport DTO type aliases. The touched coverage test replaces ten error casts with actual augmented Errors, explicitly types the injected plumbing mocks, and provides a collection refusal on streaming-only fixtures. Existing default repository initialization is unchanged; tests can explicitly select SHA-1 or SHA-256.

## Initial validation record

| Phase | Result and limits |
| --- | --- |
| red-985-v3 | Unchanged production baseline: five passing cases and exactly three SHA-256 failures (creation, abbreviated target, public Lane bootstrap). |
| green-985-v3 | 139 tests passed across six files; source/test typecheck and touched-file ESLint passed. Includes actual Git, competing absent creation, stale expectation, exact ref preservation, deletion, malformed/wrong-format target, and public Runtime reopen in both formats. |
| witness-985-957-v1 | Exact #957 test and process fixture from `f8680b03` temporarily copied into this candidate. Both formats reach the independent Lamport assertion: expected 1 greater than 21. This deliberately failing witness proves the bootstrap prerequisite, not a Lamport fix. Temporary inputs were byte-checked and removed. |
| coverage-985-v1 | 232 tests passed across nine files, including the critical noCoordination suite. Adapter lines 181/181, statements 187/187, functions 45/45; branches 55/56 (98.21%). The missing branch is the unchanged defensive undefined check in readTree, outside CAS. No coverage thresholds were rewritten. Full lint then caught the file-size ceiling; removing one redundant blank line repaired it. |
| full-985-v1 | Final candidate full repository lint and source/test typecheck passed. Unit launch failed before tests because an explicit --maxWorkers argument duplicated the stable runner's worker argument. Corrected invocation uses its documented WARP_TEST_MAX_WORKERS setting. |
| full-unit-985-v2 | Full stable suite began with two workers. Small-surfaces: 304 passed, two skipped. Infrastructure: 974 passed. Scripts: 894 passed, eight failed, one uncaught exception. Runner stopped at that shard, leaving later domain shards unrun. Seven failures concern unavailable Chromium/browser probes; one npm-pack hook test retained an absolute fixture hook path. Full-suite acceptance remains incomplete. |

The older red-985-v1/v2 receipts preserve corrections to an incorrect initial error oracle. green-985-v1 records the obsolete zero-sentinel unit expectation. green-985-v2 records two test type errors fixed before green-985-v3. None of those phases is presented as successful validation.

The scripts failures are outside this change's source/test paths. Missing Chromium is established by spawn ENOENT at the configured Puppeteer cache executable. The hook fixture source and installer were read, but its failure cause has not been established. Do not call it a confirmed baseline defect without a separate baseline reproduction. The reused Node 24 toolchain is not the repository's complete Node 22 browser-equipped CI image. No test was skipped or weakened to produce a green claim.

## Resource and evidence custody

Every test and check runs inside a COPY-based, read-only-root reusable worker, `git-warp-tests`, using immutable toolchain image `sha256:9f145953f6e79a59749a683d11a476133cb7cef0588b79256dc195b1d0c87ad7`. There are no host repository or Git-directory mounts. One named build volume is reused. Commands require workstation.git locks for host/heavy-work and host/docker/git-warp-tests/ together.

The guarded runner enforces four CPUs, 8 GiB memory, 768 PIDs, a 1700-second inner deadline, process-group shutdown, 3 GiB runtime tmpfs, small auxiliary tmpfs mounts, 16 MiB per-phase output, 96 MiB generated nonobject accounting, bounded Docker logs, and a 20 GiB monitored aggregate build ceiling. Build-volume accounting uses fail-closed polling, not a filesystem quota. The outer monitor reserves 80 MiB for retained host evidence and checks host free space. Both host and Docker backing storage must have 50 GiB free. The worker stops before its lease is released.

Across the initial ten recorded phases, the largest build peak is 797,933,568 bytes, runtime /data peak 26,480,640 bytes, and phase output 64,403 bytes. Minimum recorded VM free space exceeds 693 GB; host free space was about 680 GiB. No resource guard refusal occurred in those initial phases. Resource receipts contain exact values; they do not establish application correctness. Reusable dependencies remain in the single bounded build volume; runtime tmpfs is discarded on stop.

The manifest binds original receipt hashes, public content hashes, and each compressed console log. Public copies replace the container user's home with <CONTAINER_HOME>; original receipts remain in the local validation scratch store. Gzip logs preserve all remaining bytes and trailing blank lines. Source inputs are separately hashed in candidate-inputs.json. Launch receipts bind the copied source archive, command, image, limits, and resource ownership. Source base means the candidate's Git parent, not a claim that all runs used an unmodified tree.

## Manual SSJS scorecard and remaining work

All six checks are green for the touched implementation: no new domain concept requires a runtime class; transport validation stays in the adapter; behavior stays in its owning adapter; no message parsing controls CAS; no domain clock or entropy is introduced; no casts or fake shape trust are introduced. Constructor-injected plumbing remains the capability boundary. Runtime-facing tests exercise real Git and public Runtime exports.

The storage regression is fixed in the candidate and the public golden cases pass. The Node 22 validation below supersedes the initial full-suite and environment limitations. Independent current-code review, hosted runtime-matrix checks, PR traceability, and mainline integration remain open. The unchanged defensive readTree branch remains uncovered. This is candidate evidence, not release approval or completion of #985 or #957.

## Node 22 validation update

The implementation and test input hashes in candidate-inputs.json are unchanged from code commit `46dd9a07ddc57c2244cbf164092e380e647f1e01`. The Unreleased changelog entry is an additional documentation change. This section supersedes the initial Node 24 full-suite limitation; it does not erase its failed evidence or claim a release.

The same worker, image, build volume, 20 GiB build budget, 4 GiB project data budget, and 128 MiB project log budget are reused. A verified official Node 22.23.3 arm64 archive supplies npm 10.9.9. Extracted Debian packages supply Chromium 154.0.8037.92, BATS 1.8.2, and jq 1.6. No package maintainer scripts or system services were started. The toolchain and package hashes are retained in the identity receipts. Dependencies were reinstalled in the same cache after its key was extended to include Node version, module ABI, and npm version. The borrowed base image remains immutable and still contains Node 24; these runs select the recorded Node 22 binary explicitly.

| Phase | Result |
| --- | --- |
| toolchain-green-985-v1 | All 49 tests in the four previously failing scripts files pass. Browser and hook source are unchanged. The hook fixture failure is absent on npm 10; this does not prove npm 11 compatibility. |
| full-unit-985-node22-v1 | All six stable shards pass: 8,669 tests passed, two pre-existing skips, zero failures. |
| integration-985-node22-v1 | Full repository lint and source/test typecheck pass. Both declared integration phases pass: 159 plus 20 tests, 179 total. Includes all ten SHA-1/SHA-256 golden cases. |
| bats-985-node22-v3 | All 48 BATS cases pass after missing BATS/jq tools were added to the same worker. Release-consumer fixtures are synthetic; they do not prove an actual registry publication. |
| coverage-static-985-node22-v1 | Policy, consumer types, and declaration surface pass. Documentation rendering caused the guard to refuse when it could not spawn its accounting process. Later runs reduce CPU affinity within the existing CPU budget. |
| coverage-static-985-node22-v2 | Documentation passes: all 51 Mermaid diagrams render, code samples and topology checks pass. Coverage stops at the 96 MiB nonobject/log reserve; this incomplete coverage run is not a pass. |
| full-coverage-985-node22-v3 | Full instrumented manifest completes: 822 selected files, 8,879 tests passed, two pre-existing skips, zero errors. Full line coverage is 27,870/29,621, 94.08%, above the unchanged 93.48% gate. The adapter remains 181/181 lines, 187/187 statements, 45/45 functions, and 55/56 branches. Reporting mode leaves the ratchet unchanged. |
| toolchain-identity-985-v2 | Configured toolchain versions, downloaded package hashes, retained cache sizes, and Chromium dynamic libraries verify. The preceding probe omitted the configured library environment and is retained as a failed diagnostic. |

The two documentation/coverage guard refusals are preserved. CPU affinity now exposes exactly cores 0-3 while retaining the four-CPU quota, 8 GiB memory and 768-task limit. The guard reserves 16 tasks for accounting and captures cgroup counters. Chromium's Linux CPU count respects affinity ([source](https://raw.githubusercontent.com/chromium/chromium/main/base/system/sys_info_posix.cc)); the successful diagram run has cgroup max/oom counters of zero.

Coverage artifacts now use the existing quota-limited /data tmpfs at /data/coverage. They are measured separately from log/nonobject output and remain inside the existing 3 GiB physical tmpfs quota and 4 GiB project data allocation. No disk or log budget was increased. The successful full-coverage run peaks at 221,908,992 bytes of /data, including 173,346,816 bytes of coverage artifacts, and 48,013,312 bytes of other generated data. Process peak is 178 tasks; cgroup PID and OOM events remain zero. Runtime tmpfs, including coverage traces, is discarded on stop. The compressed console preserves the full summary; the separate small summary is derived from it.

Across the added receipts, maximum build usage is 1,958,318,080 bytes, which includes the partial coverage output before source refresh removed it. Successful full coverage peaks at 1,889,492,992 build bytes. The identity receipts separately measure retained toolchain and dependency caches. All workers stop before releasing their leases. Runner scripts remain in task-owned local scratch outside Git; node22-validation.json.gz preserves the immutable launch and resource receipts, node22-manifest.json binds original/public hashes, and each console is preserved in its own gzip file. Bootstrap/guard changes are local test orchestration, not production Git behavior or a replacement project-wide runner.

The dependency installation still reports ten npm advisories (seven low, two moderate, one high). They were not altered by this fix and remain an explicit release-triage item. Hosted Bun/Deno and exact-tree required CI checks remain outstanding. These passing local checks do not authorize a merge by themselves.
