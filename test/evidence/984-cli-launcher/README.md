# CLI launcher evidence for issue #984

## Baseline and process regression

The RED baseline is audit prerequisite `5c82ba6ca168d07b743fac5c6adbf38822ae0302`. Its launcher and CLI sources match main/v20.0.0 `ceb58e656ec5bc85f0ae5991bf2a55599693bbb3`. The preserved baseline wrapper contains 817 bytes and has SHA-256 `c59219529facafaed3f4f7e4c244e1f0d5f305008e06de332e0d7940c9859381`. The wrapper calls `spawnSync` to start the selected CLI in another Node process.

`launcher-red-984-v2` installs the actual package and traces Node starts through an inherited preload. Help, doctor, JSON failure, and unknown command each start two Node processes. The wrapper PID is the CLI process parent. Exit codes are 0/3/3/1. The first probe fails before valid tracing and is retained as a failed diagnostic. It is not RED evidence.

`launcher-green-984-v1` records one Node start for each of the same commands, with unchanged exit codes. The production candidate loads the selected entry as a file URL in the current process. `launcher-portable-process-red-984-v1` tests the portable regression driver against the baseline wrapper and fails on help because it observes two starts. The recorded baseline override binds the exact wrapper bytes; its package metadata is otherwise from the candidate. Its tarball compressed size need not equal an earlier pack run.

## Entry boundaries and lifecycle

Controlled entry fixtures verify dist-first selection, source fallback, spaced paths, symlinks, arguments, stdout/stderr, exit status 7, stdin, missing entry, Error and non-Error import failures, and exact-PID SIGINT/SIGTERM cleanup. Correct native V8 aggregation uses the innermost enclosing range count in each execution before union. `launcher-boundaries-coverage-984-v3` executes all 12 segments across nine wrapper executions. Earlier aggregation failures are retained. This is native V8 segment coverage of the launcher, not a Vitest four-dimension result or a coverage-ratchet change.

`launcher-mcp-startup-984-v1` initializes the actual installed MCP and calls `warp_lane_describe` to open Runtime. Exact-PID SIGINT/SIGTERM each produce clean exit 0 and no stderr. `launcher-cleanup-failure-984-v1` injects a command into the actual installed registry. Its failing close method produces equal baseline/candidate normal-completion output and exit 3; both candidate signals execute that closure and exit 3. This controlled command failure does not claim a real storage fault or physical power-loss test.

`test/bats/cli-launcher.bats` invokes the portable process-count and boundary drivers through the existing Docker BATS route. `launcher-bats-green-984-v1` passes both tests. The boundary and startup drivers kill the entire owned signal-fixture process group even when its parent has already exited.

## Supported Node versions

`launcher-min-node-984-v1` runs actual packed help and unknown-command usage on the official Node 22.0.0 binary. `launcher-min-source-984-v3` runs the actual wrapper and complete source CLI, without dist, on official Node 22.18.0. Both binaries were checked against their official SHASUMS. Earlier source-fixture attempts omitted root source entry files and failed; those attempts remain recorded. The corrected closure passes without a production change. Package engines remain unchanged; README defines a separate source-development minimum.

The reusable packed-minimum toolchain occupies 182988800 bytes and source-minimum toolchain 194826240 bytes. Both remain under the existing accounted build volume, for subsequent compatibility checks. Remove them when minimum-version validation is no longer required. No worker, image, or build-volume copy was added.

## Startup measurements and package boundary

The first two bounded pilots alternate 20 fresh Node processes per variant in the same installed package and runtime. The first baseline/candidate medians are 199.5061195/191.105198 ms; the second are 206.811557/190.3386535 ms. The second candidate p99 is 369.988803 ms versus baseline 297.049476 ms. Raw samples and p95/p99 values are retained. Filesystem and dependency caches are shared, and the guard pauses work during storage census. These are fresh-process startup pilots, not cold-disk measurements or a universal/all-tail latency guarantee. A third run, `launcher-startup-cleanup-984-v1`, verifies the changed driver cleanup path and actual MCP signals; its baseline/candidate medians are 201.49615599999998/187.0664805 ms. Its raw samples remain separate from the first two pilots.

The original candidate payload is 746123 compressed bytes, 3257164 unpacked bytes, and 971 entries. Unchanged limits are 760000/3300000/1050. The original baseline payload is 746177/3257290/971. `packed-compat-984-v1` passes the complete installed public API and attachment smoke suite, including a 64 MiB stream.

## Review and validation boundaries

The proposal reviewer violated the read-only assignment and committed `88a298dd`. That history is preserved. The primary agent inspected and tested the implementation. The complete proposal feedback and qualification were delivered intact to Reader receipt `2ba06dee-4118-44d8-847f-2db8030a5c22`. That proposal output does not count as independent implemented-code approval. A separate clone is used for the final review.

The real pre-push chain on `2eb60b816add5dd3f6b0462af345ea838c18104a` passes nine static tasks and six unit shards: 304/974/910/3139/2100/1250, totaling 8677 passing assertions with two existing skips. A nested script probe is included in those totals. Final current-head validation and independent review must still pass after subsequent test/evidence commits. Draft PR #993 targets the audit prerequisite branch. Mainline merging remains paused.

Manual SSJS scorecard: no new domain concept requires a runtime class; entry validation stays at the executable boundary; loading behavior remains in its launcher; no message parsing controls production behavior; no domain time or entropy is added; no casts or fake shape trust are added. All six checks are green on changed production code.

## Resource and evidence custody

All executions use the reused COPY worker under its concrete resource reservation. Limits remain 20 GiB monitored build storage, 3 GiB runtime tmpfs within the aggregate 4 GiB data budget, 128 MiB project logs, 16 MiB per-run stdout, 96 MiB generated nonobject output, four CPUs, 8 GiB memory/swap, 768 tasks, and 50 GiB host/VM free-space guards. Deadlines and worker teardown precede lease release. A named volume and memory limit are not disk quotas. The guard pauses owned processes during its filesystem census and fails closed on measurement failure.

Manifests distinguish original raw hashes, public normalized payload hashes, and compressed archive hashes. Public normalization replaces the container home with `<CONTAINER_HOME>` only. Launch receipts bind exact input snapshots, image, commands, baseline overrides, guard hash, resource limits, and results. Failed phases remain evidence and are not counted as passes.
