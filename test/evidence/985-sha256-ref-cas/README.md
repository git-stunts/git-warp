# #985: absent-ref CAS in both Git object formats

Issue: [#985](https://github.com/git-stunts/git-warp/issues/985). Base: `ceb58e656ec5bc85f0ae5991bf2a55599693bbb3`, verified remote main and peeled v20.0.0. The peeled v19.1.0 commit is an ancestor; v20.0.0 contains 472 additional commits.

## Diagnosis and candidate

The adapter validates SHA-256 targets but sends a 40-digit zero old OID for absent-ref creation. Git refuses that argument before SubstrateVersionGate can publish the initial marker. Git documents an empty old value as an absent-ref expectation, independent of object format: [git-update-ref](https://git-scm.com/docs/git-update-ref).

The candidate passes an explicit empty argument when the expected ref is absent. It preserves expected-old replacement, deletion, direct non-retrying CAS execution, errors, and abbreviated target support. Inferring width from the target spelling would break abbreviated targets. No Lamport production code changes belong in this slice.

Two adapter option interfaces become transport DTO type aliases. The touched coverage test replaces ten error casts with actual augmented Errors, explicitly types the injected plumbing mocks, and provides a collection refusal on streaming-only fixtures. Existing default repository initialization is unchanged; tests can explicitly select SHA-1 or SHA-256.

## Validation record

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

Across recorded phases, the largest build peak is 797,933,568 bytes, runtime /data peak 26,480,640 bytes, and phase output 64,403 bytes. Minimum recorded VM free space exceeds 693 GB; final measured host free space is about 680 GiB. No resource guard refusal occurred. Resource receipts contain exact values; they do not establish application correctness. Reusable dependencies remain in the single bounded build volume; runtime tmpfs is discarded on stop.

The manifest binds original receipt hashes, public content hashes, and each compressed console log. Public copies replace the container user's home with <CONTAINER_HOME>; original receipts remain in the local validation scratch store. Gzip logs preserve all remaining bytes and trailing blank lines. Source inputs are separately hashed in candidate-inputs.json. Launch receipts bind the copied source archive, command, image, limits, and resource ownership. Source base means the candidate's Git parent, not a claim that all runs used an unmodified tree.

## Manual SSJS scorecard and remaining work

All six checks are green for the touched implementation: no new domain concept requires a runtime class; transport validation stays in the adapter; behavior stays in its owning adapter; no message parsing controls CAS; no domain clock or entropy is introduced; no casts or fake shape trust are introduced. Constructor-injected plumbing remains the capability boundary. Runtime-facing tests exercise real Git and public Runtime exports.

The storage regression is fixed in the candidate and the public golden cases pass. Full suite, browser-equipped Node 22 compatibility, independent current-code review, PR traceability, and mainline integration remain open. The unchanged defensive readTree branch remains uncovered. This is candidate evidence, not release approval or completion of #985 or #957.
