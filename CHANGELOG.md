# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [10.14.0] — 2026-02-14 — Patch Wrapper

Adds `graph.patch(fn)` — a single-await convenience wrapper around `createPatch()` + `commit()`. No semantic or runtime behavior changes; purely ergonomic sugar.

### Added

- **`graph.patch(fn)`**: Creates a patch, runs the callback, and commits in one await. Callback may be sync or async. Errors propagate untouched — no wrapping or relabeling.
- **`PatchSession.setEdgeProperty()`**: Delegate for setting properties on edges via `PatchSession` (previously only available on `PatchBuilderV2`).
- **TypeScript**: `patch()` on `WarpGraph`, `setEdgeProperty()` on `PatchSession`, `createPatch()` return type narrowed from `Promise<unknown>` to `Promise<PatchSession>`.

### Fixed

- **`graph.patch()` reentrancy guard**: Nested `graph.patch()` calls inside a callback now throw a clear error instead of silently breaking CAS semantics. Use `createPatch()` directly for advanced multi-patch workflows.
- **`examples/setup.js`**: Added missing `await` on `getNodes()`, `getEdges()`, and `getNodeProps()` calls (pre-existing bug).

## [10.13.0] — 2026-02-13 — Doctor Command

Adds `git warp doctor`, a structural diagnostics command that probes for anomalies (broken refs, missing objects, clock drift, audit gaps) and prescribes fixes. Read-only, no materialization required.

### Added

- **`git warp doctor`**: 7 diagnostic checks — repo-accessible, refs-consistent, coverage-complete, checkpoint-fresh, audit-consistent, clock-skew, hooks-installed
- **`--strict` flag**: Treats warnings as failures (exit 4 instead of 3)
- **Budget enforcement**: Global 10s deadline; skipped checks appear as findings, not silent omissions
- **Error boundary**: Each check is wrapped in try/catch so a single failing check produces a `CHECK_INTERNAL_ERROR` finding instead of crashing the entire command
- **Machine-readable output**: `--json` emits versioned `DoctorPayload` (v1) with policy echo, sorted findings, and priority actions
- **Human-readable output**: Colored status icons, per-finding fix suggestions, priority action summary
- **Code registry**: `bin/cli/commands/doctor/codes.js` — single source of truth for all finding codes
- **Schema + unit tests**: `doctorSchema` tests in schemas.test.js, golden-JSON tests in doctor.test.js
- **BATS E2E tests**: 5 scenarios in cli-doctor.bats (healthy JSON, human output, broken ref, missing checkpoint, strict mode)

### Fixed

- **coverage-complete**: Writer heads with null SHA are now reported as missing (not silently skipped)
- **checkHooksInstalled**: Made `async` for consistency with other check functions; removed redundant `await Promise.resolve()` wrapping
- **sort-order test**: Hardened to exercise all three status tiers (fail/warn/ok) with targeted mocks and assert the full three-key sort invariant (status > impact > id)
- **refs-consistent**: OK message now counts only verified refs (excludes null-sha writer heads); null-sha heads reported as `REFS_DANGLING_OBJECT`
- **collectWriterHeads**: Gracefully handles `readRef` failures (e.g. `git show-ref` exit 128 for dangling refs) instead of crashing the entire doctor command
- **seed-doctor-graph.js**: Calls `createCheckpoint()` + `syncCoverage()` (materialize alone does not create these refs); removed stale "installs hooks" claim
- **`_run_json` BATS helper**: Fixed status capture bug (`|| true` made `$?` always 0)

## [10.12.0] — 2026-02-13 — Multi-Runtime CLI + parseArgs Migration

Makes the CLI (`bin/`) portable across Node 22+, Bun, and Deno by removing Node-only dependencies, and replaces hand-rolled arg parsing with `node:util.parseArgs` + Zod schemas.

### Fixed

- **verify-audit**: Reject empty-string `--since`/`--writer` values at schema level; use strict `!== undefined` check for `writerFilter`
- **install-hooks**: `readHookContent` now only swallows ENOENT; permission errors propagate
- **view**: Module-not-found catch narrowed to `git-warp-tui` specifier/package name only (ignores transitive dep failures)
- **schemas**: `--max-depth` rejects negative values; `--diff` alone (without --tick/--latest/--load) now rejected; `--save`/`--load`/`--drop` reject empty-string cursor names; `--diff-limit` validates positive integer with user-friendly message; `--diff-limit` without `--diff` now rejected
- **npm packaging**: Added `bin/cli` to the `files` array — the commands-split refactor broke the published package for CLI use.
- **BATS audit seed**: Added `materialize()` call before first patch so `_cachedState` is initialized and audit receipts are created (all 5 verify-audit BATS tests were failing in CI).

### Changed

- **COMMANDS registry**: Extracted `COMMANDS` Map from `warp-graph.js` into `bin/cli/commands/registry.js` (side-effect-free); `KNOWN_COMMANDS` exported from `infrastructure.js`. Sync test asserts they match via direct import.
- **Cross-runtime adapters**: `NodeCryptoAdapter` → `WebCryptoAdapter` (uses `globalThis.crypto.subtle`), `ClockAdapter.node()` → `ClockAdapter.global()` (uses `globalThis.performance`), removed `import crypto from 'node:crypto'` in seek.js (converted `computeFrontierHash` to async Web Crypto).
- **Base arg parser** (`bin/cli/infrastructure.js`): Replaced 170 LOC hand-rolled parser with `node:util.parseArgs`. Two-pass approach: `extractBaseArgs` splits base flags from command args, `preprocessView` handles `--view`'s optional-value semantics. Returns `{options, command, commandArgs}` instead of `{options, positionals}`.
- **Per-command parsers**: All 10 commands now use `parseCommandArgs()` (wraps `nodeParseArgs` + Zod `safeParse`) instead of hand-rolled loops. Query uses a hybrid approach: `extractTraversalSteps` for `--outgoing`/`--incoming` optional values, then standard parsing for the rest.
- **Removed** `readOptionValue` and helper functions from infrastructure.js (no longer needed).

### Added

- **`bin/cli/schemas.js`**: Zod schemas for all commands — type coercion, enum validation, mutual-exclusion checks (seek's 10-flag parser).
- **`parseCommandArgs()`** in infrastructure.js: Shared helper wrapping `nodeParseArgs` + Zod validation for command-level parsing.
- **67 new CLI tests**: `parseArgs.test.js` (25 tests for base parsing), `schemas.test.js` (32 tests for Zod schema validation).
- **Public export**: `InMemoryGraphAdapter` now exported from the package entry point (`index.js` + `index.d.ts`) so downstream modules can use it for tests without reaching into internal paths.

## [10.11.0] — 2026-02-12 — COMMANDS SPLIT: CLI Decomposition

Decomposes the 2491-line `bin/warp-graph.js` monolith into per-command modules (M5.T1). Pure refactor — no behavior changes.

### Changed

- **`bin/warp-graph.js`**: Reduced from 2491 LOC to 112 LOC. Now contains only imports, the COMMANDS map, VIEW_SUPPORTED_COMMANDS, `main()`, and the error handler.
- **`bin/cli/infrastructure.js`**: EXIT_CODES, HELP_TEXT, CliError, parseArgs, and arg-parsing helpers.
- **`bin/cli/shared.js`**: 12 helpers used by 2+ commands (createPersistence, openGraph, applyCursorCeiling, etc.).
- **`bin/cli/types.js`**: JSDoc typedefs (Persistence, WarpGraphInstance, CliOptions, etc.).
- **`bin/cli/commands/`**: 10 per-command modules (info, query, path, history, check, materialize, seek, verify-audit, view, install-hooks).
- **ESLint config**: Added `bin/cli/commands/seek.js`, `bin/cli/commands/query.js`, and other `bin/cli/` modules to the relaxed-complexity block alongside `bin/warp-graph.js`.

## [10.10.0] — 2026-02-12 — VERIFY-AUDIT: Chain Verification

Implements cryptographic verification of audit receipt chains (M4.T1). Walks chains backward from tip to genesis, validating receipt schema, chain linking, Git parent consistency, tick monotonicity, trailer-CBOR consistency, OID format, and tree structure.

### Added

- **`AuditVerifierService`** (`src/domain/services/AuditVerifierService.js`): Domain service with `verifyChain()` and `verifyAll()` methods. Supports `--since` partial verification and ref-race detection.
- **`getCommitTree(sha)`** on `CommitPort` / `GraphPersistencePort`: Returns the tree OID for a given commit. Implemented in `GitGraphAdapter` (via `git rev-parse`) and `InMemoryGraphAdapter`.
- **`buildAuditPrefix()`** in `RefLayout`: Lists all audit writer refs under a graph.
- **`verify-audit` CLI command**: `git warp verify-audit [--writer <id>] [--since <commit>]`. Supports `--json` and `--ndjson` output. Exit code 3 on invalid chains.
- **Text presenter** for verify-audit: colored status, per-chain detail, trust warnings.
- **31 unit tests** in `AuditVerifierService.test.js` — valid chains, partial verification, broken chain detection, data mismatch, OID format validation, schema validation, warnings, multi-writer aggregation.
- **6 BATS CLI tests** in `cli-verify-audit.bats` — JSON/human output, writer filter, partial verify, tamper detection, no-audit-refs success.
- **Benchmark** in `AuditVerifierService.bench.js` — 1000-receipt chain verification (<5s target).

## [10.9.0] — 2026-02-12 — SHADOW-LEDGER: Audit Receipts

Implements tamper-evident, chained audit receipts per the spec in `docs/specs/AUDIT_RECEIPT.md`. When `audit: true` is passed to `WarpGraph.open()`, each data commit produces a corresponding audit commit recording per-operation outcomes. Audit commits form an independent chain per (graphName, writerId) pair, linked via `prevAuditCommit` and Git commit parents.

### Added

- **`audit: true` option** on `WarpGraph.open()` / constructor: Enables the audit receipt pipeline. Off by default — zero overhead when disabled.
- **`AuditReceiptService`** (`src/domain/services/AuditReceiptService.js`): Core service implementing canonicalization (domain-separated SHA-256 `opsDigest`), receipt record construction, Git object creation (blob → tree → commit → CAS ref update), retry-once on CAS conflict, degraded-mode resilience, and structured error codes.
- **`AuditMessageCodec`** (`src/domain/services/AuditMessageCodec.js`): Encode/decode audit commit messages with 6 trailers (`data-commit`, `graph`, `kind`, `ops-digest`, `schema`, `writer`) in lexicographic order.
- **`compareAndSwapRef()`** on `RefPort` / `GraphPersistencePort`: Atomic ref update with expected-old-value guard. Implemented in both `GitGraphAdapter` (via `git update-ref`) and `InMemoryGraphAdapter`.
- **`buildAuditRef()`** in `RefLayout`: Produces `refs/warp/<graphName>/audit/<writerId>` paths.
- **Spec amendment**: `timestamp` field changed from ISO-8601 string to POSIX millisecond integer (`uint`) in `docs/specs/AUDIT_RECEIPT.md`. All golden vector CBOR hex values regenerated.
- **34 unit tests** in `AuditReceiptService.test.js` — canonicalization, golden vectors, receipt construction, commit flow, CAS conflict/retry, error resilience, TickReceipt integration.
- **3 coverage tests** in `AuditReceiptService.coverage.test.js` — stats tracking for committed/skipped/failed counts.
- **5 codec tests** in `AuditMessageCodec.test.js` — round-trip, trailer order, missing/invalid trailers.
- **3 ref layout tests** in `RefLayout.audit.test.js` — `buildAuditRef` path construction.
- **4 CAS tests** in `RefPort.compareAndSwapRef.test.js` — genesis CAS, update CAS, mismatch rejection, pre-existing conflict.
- **7 integration tests** in `WarpGraph.audit.test.js` — audit off/on, ref advancement, chain linking, dirty-state skip, CBOR content verification, state correctness.
- **Benchmark stubs** in `AuditReceiptService.bench.js` for `computeOpsDigest` and `buildReceiptRecord`.

### Changed

- **`WarpGraph._onPatchCommitted()`**: When audit is enabled, invokes `joinPatch()` with receipt collection, then calls `AuditReceiptService.commit()` after state updates succeed. Logs `AUDIT_SKIPPED_DIRTY_STATE` when eager re-materialize is not possible.
- **`MessageCodecInternal`**: Added `audit` title constant and `dataCommit`/`opsDigest` trailer keys.
- **`MessageSchemaDetector`**: Recognizes `'audit'` message kind.
- **`WarpMessageCodec`**: Re-exports `encodeAuditMessage` and `decodeAuditMessage`.
- **`eslint.config.js`**: Added `AuditReceiptService.js` and `AuditMessageCodec.js` to relaxed complexity block.
- **`GraphPersistencePort.test.js`**: Added `compareAndSwapRef` to expected method list.
- **M3.T1.SHADOW-LEDGER** marked `DONE` in `ROADMAP.md`.

### Fixed

- **`WarpGraph.open()` audit validation**: Non-boolean truthy values (e.g. `'yes'`, `1`) now throw `'audit must be a boolean'`, matching existing `autoMaterialize` validation pattern.
- **`AuditReceiptService._commitInner()` cross-writer guard**: Rejects `TickReceipt` where `writer` does not match the service's `writerId`, preventing cross-writer attribution in the audit chain.
- **`GitGraphAdapter.compareAndSwapRef()`**: No longer retries on CAS mismatch — calls `plumbing.execute()` directly instead of `_executeWithRetry()`, since CAS failures are semantically expected.
- **`decodeAuditMessage()` hardened validation**: Decoder now validates graph name, writer ID, dataCommit OID format, opsDigest SHA-256 format, and schema as strict integer (rejects `1.5`), matching encoder strictness.
- **`AuditReceiptService.init()` cold-start logging**: Now logs `AUDIT_INIT_READ_FAILED` warning before falling back to genesis, giving operators visibility into unexpected cold starts.
- **`AuditReceiptService` dead write removed**: Removed unused `_tickCounter` field that was written but never read.
- **`WarpMessageCodec` JSDoc**: Updated from "three types" to "four types" and added `AuditMessageCodec` to the sub-module list.
- **`RefLayout` JSDoc**: Added `refs/warp/<graph>/audit/<writer_id>` to the module-level ref layout documentation.
- **`docs/GUIDE.md` trailer names**: Corrected trailer key names to include `eg-` prefix (e.g. `eg-data-commit` not `data-commit`).
- **`computeOpsDigest()` TextEncoder**: Hoisted to module-level constant to avoid per-call allocation.

## [10.8.0] — 2026-02-11 — PRESENTER: Output Contracts

Extracts CLI rendering into `bin/presenters/`, adds NDJSON output and color control. Net reduction of ~460 LOC in `bin/warp-graph.js`.

### Added

- **`--ndjson` flag**: Compact single-line JSON output with sorted keys for piping and scripting. Full payload structure preserved, `_`-prefixed internal keys stripped. Mutually exclusive with `--json` and `--view`.
- **`NO_COLOR` / `FORCE_COLOR` / `CI` support**: Plain-text output automatically strips ANSI escape codes when `NO_COLOR` is set, `FORCE_COLOR=0`, stdout is not a TTY, or `CI` is set. `FORCE_COLOR` (non-zero) forces color on.
- **`bin/presenters/json.js`**: `stableStringify()` (pretty-printed sorted JSON), `compactStringify()` (single-line sorted JSON), `sanitizePayload()` (strips `_`-prefixed keys).
- **`bin/presenters/text.js`**: All 9 plain-text renderers extracted from `warp-graph.js` — `renderInfo`, `renderQuery`, `renderPath`, `renderCheck`, `renderHistory`, `renderError`, `renderMaterialize`, `renderInstallHooks`, `renderSeek`.
- **`bin/presenters/index.js`**: Unified `present()` dispatcher replacing the 112-line `emit()` function. Handles format dispatch (text/json/ndjson), view mode routing (ASCII/SVG/HTML), and color control.
- **51 new unit tests** across `test/unit/presenters/` (json, text, present).
- **6 BATS integration tests** in `test/bats/cli-ndjson.bats` for NDJSON output and mutual-exclusion enforcement.

### Fixed

- **`--json` output sanitized**: Internal `_renderedSvg` and `_renderedAscii` keys are now stripped from JSON output. Previously these rendering artifacts leaked into `--json` payloads.
- **`package.json` files array**: Added `bin/presenters` so npm-published tarball includes the presenter modules (would have caused `MODULE_NOT_FOUND` at runtime).
- **`--view query` null guard**: `_renderedAscii` now uses `?? ''` fallback to prevent `"undefined"` in output when pre-rendered ASCII is missing.
- **`CliOptions` typedef**: Added missing `ndjson` property to JSDoc typedef.

### Changed

- **`bin/warp-graph.js`**: Reduced from 2893 to ~2430 LOC. Removed `stableStringify`, 9 `renderXxx` functions, `emit()`, `writeHtmlExport()`, ANSI constants. Replaced with 3-line `present()` call.
- **`renderSeek`**: Decomposed into `renderSeekSimple()`, `renderSeekList()`, `renderSeekState()`, and `renderSeekWithDiff()` to stay within ESLint complexity limits.
- **`renderCheck`**: Decomposed into `appendCheckpointAndWriters()` and `appendCoverageAndExtras()` helpers.
- **M2.T2.PRESENTER** marked `DONE` in `ROADMAP.md`.

## [10.7.0] — 2026-02-11 — MEM-ADAPTER: In-Memory Persistence

Adds `InMemoryGraphAdapter`, a zero-I/O implementation of `GraphPersistencePort` for fast tests.

### Added

- **`InMemoryGraphAdapter`** (`src/infrastructure/adapters/InMemoryGraphAdapter.js`): Full in-memory implementation of all five ports (Commit, Blob, Tree, Ref, Config). Uses Git's SHA-1 object format for content-addressable hashing. Accepts optional `author` and `clock` injection for deterministic tests.
- **`adapterValidation.js`** (`src/infrastructure/adapters/adapterValidation.js`): Extracted shared validation functions (`validateOid`, `validateRef`, `validateLimit`, `validateConfigKey`) used by both adapters.
- **Adapter conformance suite** (`test/unit/infrastructure/adapters/AdapterConformance.js`): ~25 shared behavioral tests that run against any `GraphPersistencePort` implementation, ensuring parity between Git and in-memory adapters.
- **`createInMemoryRepo()`** (`test/helpers/warpGraphTestUtils.js`): Test factory for instant in-memory adapter setup — no temp dirs, no git subprocesses.

### Fixed

- **`InMemoryGraphAdapter.writeTree()`**: Rejects malformed mktree entries missing a tab separator instead of silently producing garbage.
- **`InMemoryGraphAdapter._walkLog()`**: Replaced O(n) `queue.shift()` with index-pointer for O(1) dequeue; sort by date descending to match Git's reverse chronological ordering for merge DAGs.
- **`adapterValidation.validateRef()`**: Removed redundant `startsWith('--')` check (already covered by `startsWith('-')`).

### Changed

- **`GitGraphAdapter`**: Validation methods now delegate to shared `adapterValidation.js` functions. No behavioral change.

## [10.6.1] — 2026-02-11 — Code Review Fixups

Addresses code review feedback from PR #23 across SEEKDIFF and SHIELD features.

### Fixed

- **`SyncAuthService.verify()`**: Nonce is now reserved *after* signature verification, preventing valid nonces from being consumed by requests with invalid signatures.
- **`HttpSyncServer.initAuth()`**: Validates `auth.mode` against allowed values (`'enforce'`, `'log-only'`), throwing on invalid strings instead of silently accepting them.
- **`parseSeekArgs()`**: `--diff-limit` without `--diff` now throws a clear usage error instead of being silently ignored.
- **`handleDiffLimitFlag()`**: Uses `Number()` instead of `parseInt()` to reject float values like `"1.5"` that were previously silently truncated to integers.
- **`buildTruncationHint()`**: Clamps remaining-change counts to non-negative values, preventing display of negative counts with pathological inputs.
- **`applyDiffLimit()`**: Comment corrected from "proportionally" to "sequentially" to match the actual greedy truncation behavior.

## [10.6.0] — 2026-02-11 — SHIELD: Hardened Sync Auth

Adds HMAC-SHA256 request signing with replay protection to the HTTP sync protocol. Gated by an `auth` options object — when absent, behavior is unchanged (full backward compatibility).

### Added

- **`SyncAuthService`** (`src/domain/services/SyncAuthService.js`): Core auth service with canonical payload construction, HMAC-SHA256 signing, verification with replay protection (nonce LRU cache), clock skew validation, key-id based key selection, and structured metrics.
- **`signSyncRequest()`** and **`canonicalizePath()`**: Exported helpers for client-side request signing and path canonicalization.
- **`serve({ auth })`**: Server-side auth configuration accepting `{ keys: Record<string, string>, mode: 'enforce' | 'log-only' }`. Creates a `SyncAuthService` instance internally.
- **`syncWith(url, { auth })`**: Client-side auth credentials accepting `{ secret: string, keyId?: string }`. Signs outgoing requests with HMAC-SHA256.
- **Auth headers**: `x-warp-sig-version`, `x-warp-key-id`, `x-warp-signature`, `x-warp-timestamp`, `x-warp-nonce` — 5 headers per signed request.
- **Canonical signed payload**: `warp-v1|KEY_ID|METHOD|PATH|TIMESTAMP|NONCE|CONTENT_TYPE|BODY_SHA256`.
- **Enforcement modes**: `enforce` (reject on failure) and `log-only` (warn but allow through) for gradual rollout.
- **Key-id based key selection**: Server accepts `keys: Record<string, string>` mapping key-id to secret, enabling zero-downtime key rotation and multi-tenant setups.
- **Auth metrics**: `authFailCount`, `replayRejectCount`, `nonceEvictions`, `clockSkewRejects`, `malformedRejects`, `logOnlyPassthroughs` via `getMetrics()`.
- **TypeScript types**: `SyncAuthServerOptions`, `SyncAuthClientOptions` interfaces in `index.d.ts`.
- **`SECURITY.md`**: Sync authentication section with threat model, restart semantics, key rotation guide, and configuration examples.
- **Unit tests**: `SyncAuthService.test.js` (42 tests) — canonical payload, path canonicalization, signing, verification reject/happy paths, metrics, constructor validation.
- **Integration tests**: `HttpSyncServer.auth.test.js` (15 tests) — enforce mode, log-only mode, backward compatibility, body-size ordering.
- **E2E tests**: `WarpGraph.syncAuth.test.js` (8 tests) — real HTTP with NodeHttpAdapter covering enforce, log-only, no-auth, wrong-secret, wrong-key-id, multi-key, and replay safety.

### Changed

- **`HttpSyncServer`**: Extracted `checkBodySize()` from `parseBody()` for DoS guard ordering (413 before auth). Added `_checkAuth()` private method and `initAuth()` factory for auth initialization.
- **`WarpGraph.syncWith()`**: Extracted `buildSyncAuthHeaders()` helper to stay within ESLint `max-lines-per-function` limit. Body string computed once and reused for both signing and `fetch()`.
- **M1.T1.SHIELD** marked `DONE` in `ROADMAP.md`.

## [10.5.0] — 2026-02-10 — SEEKDIFF: Structural Seek Diff

Shows *which* nodes/edges were added/removed and *which* properties changed (with old/new values) when stepping between ticks during seek exploration. Uses the existing `StateDiff.diffStates()` engine for deterministic, sorted output.

### Added

- **`--diff` flag** on `git warp seek`: Computes a structural diff between the previous cursor position and the new one. First seek uses baseline `"empty"` (everything appears as an addition); subsequent seeks use the previous cursor tick as baseline.
- **`--diff-limit=N` flag** on `git warp seek`: Caps the number of change entries in the structural diff (default 2000, minimum 1). When truncated, the payload includes `truncated: true`, `totalChanges`, and `shownChanges` metadata.
- **`WarpGraph.getStateSnapshot()`**: Returns a defensive copy of the current materialized `WarpStateV5` via `cloneStateV5()`. Returns null when no state is materialized (or auto-materializes when `autoMaterialize` is enabled). Prevents aliasing bugs when callers need to hold a reference across re-materializations.
- **ASCII structural diff section**: Colored `+` (green) / `-` (red) / `~` (yellow) lines in a `Changes (baseline: ...)` section, rendered in both plain text and `--view` (boxen) modes. Property changes show `old -> new` values.
- **JSON structural diff fields**: `structuralDiff`, `diffBaseline`, `baselineTick`, `truncated`, `totalChanges`, `shownChanges` added to the seek payload when `--diff` is active.
- **`formatStructuralDiff()`** export from `src/visualization/renderers/ascii/seek.js` for plain-text rendering.
- **SEEKDIFF milestone** (v10.5.0) added to `ROADMAP.md` and `scripts/roadmap.js` with 4 tasks (all closed).
- **Unit tests**: `WarpGraph.seekDiff.test.js` (8 tests) — state snapshot identity, defensive copy, forward/backward diff, first seek, same-tick no-op, property changes.
- **ASCII renderer tests**: 10 new tests — structural diff with tick/empty baselines, truncation message, null diff backward compat, removal entries, combined truncation, latest/load action payloads.
- **BATS E2E tests**: 9 new tests — `--diff --json` first seek, forward/backward structural diff, ASCII `Changes` section, `--latest --diff`, `--diff-limit` validation (=0, =-1, missing value), `--diff --save` rejection.

### Changed

- **`parseSeekArgs()`**: Extracted `parseSeekNamedAction()` helper for `--save`/`--load`/`--drop` parsing, reducing cyclomatic complexity. Now rejects `--diff` on non-navigating actions (`--save`, `--drop`, `--list`, `--clear-cache`, bare `status`).
- **`handleSeek()`**: Extracted `handleSeekStatus()` to stay within ESLint `max-lines-per-function` limit. `--diff` skips redundant re-materialization when `computeStructuralDiff` already materialized the target tick.
- **`computeStructuralDiff()`**: Short-circuits with an empty diff when `prevTick === currentTick`.
- **`buildSeekBodyLines()`**: Extracted `buildFooterLines()` for state summary + receipt + structural diff rendering.
- **`buildStructuralDiffLines()`**: Shows combined truncation message when both display-level (20 lines) and data-level (`--diff-limit`) truncation are active.
- **`--diff`/`--diff-limit`** added to `git warp --help` seek options.

## [10.4.2] — 2026-02-10 — TS policy enforcement (B3)

### Added

- **`scripts/ts-policy-check.js`**: Standalone policy checker that walks `src/`, `bin/`, `scripts/` and enforces two rules: (1) no `@ts-ignore` — use `@ts-expect-error` instead, (2) every inline `@type {*}` / `@type {any}` cast must carry a `// TODO(ts-cleanup): reason` tag.
- **`typecheck:policy` npm script**: Runs the policy checker (`node scripts/ts-policy-check.js`).
- **CI enforcement**: Policy check step added to both `ci.yml` (lint job) and `release-pr.yml` (preflight job), after the existing TypeScript step.
- **Pre-push hook**: Policy check runs in parallel with lint and typecheck.
- **BATS test timing**: `STARTING TEST` / `ENDED TEST` instrumentation in BATS helpers for diagnosing slow tests.

### Changed

- **Node.js >= 22.0.0**: Minimum engine bumped from 20 to 22, matching `@git-stunts/git-cas` requirement. CI matrix, release workflows, and documentation updated accordingly.
- **`@git-stunts/git-cas`**: Moved from `optionalDependencies` to `dependencies` now that Node 22 is the minimum.
- **Seek cache write is fire-and-forget**: `WarpGraph.materialize({ ceiling })` no longer awaits the persistent cache write — the CLI exits immediately after emitting output instead of blocking on background I/O (~30s → <1s for seek commands).
- **CLI uses `process.exit()`**: Ensures the process terminates promptly after emitting output, preventing fire-and-forget I/O from holding the event loop open.
- **Pre-push hook**: Removed BATS E2E tests (now CI-only) to keep pre-push fast.
- **`@ts-ignore` → `@ts-expect-error`** across 3 source files and 4 test files. `@ts-expect-error` is strictly better: it errors when the suppression becomes unnecessary.
- **~108 wildcard casts tagged** with `// TODO(ts-cleanup): reason` across ~30 source files in `src/`, `bin/`, and `scripts/`. Categorized reasons: `needs options type`, `type error`, `narrow port type`, `type patch array`, `type CLI payload`, `type http callback`, `type sync protocol`, `type lazy singleton`, `type observer cast`, and others.
- **`TYPESCRIPT_ZERO.md`**: B3 (Policy enforcement) marked complete.

## [10.4.1] — 2026-02-10 — Default crypto & join() fix

### Added

- **`defaultCrypto.js`** (`src/domain/utils/defaultCrypto.js`): Domain-local default crypto adapter wrapping `node:crypto` directly, following the `defaultCodec.js` / `defaultClock.js` pattern. Completes the BULKHEAD port injection pattern — all ports now have domain-local defaults.

### Fixed

- **`WarpGraph.join()`**: Replaced 4 references to non-existent `.elements.size` on ORSet with `orsetElements(...).length`. The `join()` happy path was always throwing a TypeError.

### Changed

- **`WarpGraph` constructor**: `this._crypto` now falls back to `defaultCrypto` when no crypto adapter is injected (same pattern as `this._codec = codec || defaultCodec`).
- **`BitmapIndexBuilder`**, **`StreamingBitmapIndexBuilder`**, **`BitmapIndexReader`**: Removed `if (!crypto) { return null; }` null guards from `computeChecksum`. Checksums are now always computed.
- **`BitmapIndexReader._validateShard`**: Removed `actualChecksum !== null &&` guard — checksum validation now always runs.
- **`StateSerializerV5.computeStateHashV5`**: Removed `crypto ? ... : null` ternary — always returns a hash string.

## [10.4.0] — 2026-02-09 — RECALL: Seek Materialization Cache

Caches materialized `WarpStateV5` at each visited ceiling tick as content-addressed blobs via `@git-stunts/git-cas`, enabling near-instant restoration for previously-visited ticks during seek exploration. Blobs are loose Git objects subject to Git GC (default prune expiry ~2 weeks, configurable) unless pinned to a vault.

### Added

- **`SeekCachePort`** (`src/ports/SeekCachePort.js`): Abstract port for seek materialization cache with `get`, `set`, `has`, `keys`, `delete`, `clear` methods.
- **`CasSeekCacheAdapter`** (`src/infrastructure/adapters/CasSeekCacheAdapter.js`): Git-CAS backed adapter with rich index metadata (treeOid, createdAt, ceiling, frontierHash, sizeBytes, codec, schemaVersion), LRU eviction (default max 200 entries), self-healing on read miss (removes dead entries when blobs are GC'd), and retry loop for transient write failures. **Requires Node >= 22.0.0** (inherited from `@git-stunts/git-cas`).
- **`seekCacheKey`** (`src/domain/utils/seekCacheKey.js`): Deterministic cache key builder producing `v1:t<ceiling>-<sha256hex>` keys. Uses SHA-256 via `node:crypto` with no fallback.
- **`buildSeekCacheRef`** in `RefLayout.js`: Builds `refs/warp/<graph>/seek-cache` ref path for the cache index.
- **`WarpGraph.open({ seekCache })`** / **`graph.setSeekCache(cache)`**: Optional `SeekCachePort` for persistent seek cache injection. Cache is checked after in-memory miss and stored after full materialization in `_materializeWithCeiling`.
- **`--clear-cache` flag** on `git warp seek`: Purges the persistent seek cache.
- **`--no-persistent-cache` flag** on `git warp seek`: Bypasses persistent cache for a single invocation (useful for full provenance access or performance testing).
- **Provenance degradation guardrails**: `_provenanceDegraded` flag on WarpGraph, set on persistent cache hit. `patchesFor()` and `materializeSlice()` throw `E_PROVENANCE_DEGRADED` with clear instructions to re-seek with `--no-persistent-cache`.
- **`SeekCachePort` export** from main entry point (`index.js`) and TypeScript definitions (`index.d.ts`).
- **Unit tests** (`test/unit/domain/seekCache.test.js`, 16 tests): Cache key determinism, WarpGraph integration with mock cache (hit/miss/error/degradation), provenance guardrails.
- **ROADMAP milestone RECALL** (v10.4.0): 6 tasks, all closed.

## [10.3.2] — 2026-02-09 — Seek CLI fixes & demo portability

### Added

- **`--save=NAME`, `--load=NAME`, `--drop=NAME` equals form**: `parseSeekArgs` now accepts `=`-separated values for `--save`, `--load`, and `--drop`, matching the existing `--tick=VALUE` form.

### Fixed

- **BATS CI: missing `append-patch.js` helper**: `test/bats/helpers/append-patch.js` was untracked, so Docker builds (which copy from the git context) never included it — causing test 55 to fail with `MODULE_NOT_FOUND` on Node 20.
- **`seek-demo.tape` not portable**: Replaced hardcoded `$HOME/git/git-stunts/git-warp` with `export PROJECT_ROOT=$(pwd)` captured before entering the temp sandbox.
- **`emitCursorWarning` / `applyCursorCeiling` JSDoc**: Clarified that non-seek commands intentionally pass `null` for `maxTick` to skip the cost of `discoverTicks()`.
- **`_resolveCeiling` treated `undefined` as valid**: The `'ceiling' in options` check returned `undefined` when options contained the key but no value. Switched to `options.ceiling !== undefined` so explicit `null` still overrides the instance ceiling but `undefined` correctly falls through.

## [10.3.1] — 2026-02-09 — Seek polish, arrowheads & demo GIF

### Added

- **Seek demo GIF** (`docs/seek-demo.gif`): Animated walkthrough showing `git warp seek` time-travel — graph topology visually changes at each tick while `git status` proves the worktree is untouched. VHS tape at `docs/seek-demo.tape`.
- **README seek demo**: Embedded `seek-demo.gif` in the CLI section below the seek command examples.
- **ROADMAP backlog**: New `## Backlog` section with two future ideas — structural seek diff (`diffStates()`) and git-cas materialization cache.
- **Op summary renderer** (`src/visualization/renderers/ascii/opSummary.js`): Extracted operation summary formatting from history renderer into a shared module used by both history and seek views.

### Fixed

- **ASCII graph arrowheads missing**: `drawArrowhead` was silently dropping arrows when the ELK endpoint fell inside a node's bounding box. Now steps back one cell to place the arrowhead just outside the node border.
- **Seek ASCII renderer**: Reworked swimlane dashboard with improved windowing, writer rows, tick receipt display, and op summary formatting.
- **Seek ceiling via public API**: Replaced direct `graph._seekCeiling` mutation in `materializeOneGraph` and `handleSeek` with `graph.materialize({ ceiling })`, using the public option instead of poking at internals.
- **Seek timeline missing currentTick**: When the active cursor referenced a tick absent from the discovered ticks array, the renderer fell back to index 0 and never showed the current tick marker. Now inserts the cursor tick at the correct sorted position so the window always centres on it.
- **Docs `--tick` signed-value syntax**: Updated GUIDE.md, README.md, and CHANGELOG examples to use `--tick=+N`/`--tick=-N` (equals form) for signed relative values, matching BATS tests and avoiding CLI parser ambiguity.
- **Ceiling cache stale on frontier advance**: `_materializeWithCeiling` cached state keyed only on ceiling + dirty flag, so it could return stale results when new writers appeared or tips advanced. Now snapshots the frontier (writer tip SHAs) alongside the ceiling and invalidates the cache when the frontier changes.
- **`resolveTickValue` duplicate tick 0**: The relative-tick resolver blindly prepended 0 to the ticks array, duplicating it when ticks already contained 0. Now checks before prepending.

### Changed

- **History renderer**: Extracted `summarizeOps` and `formatOpSummary` into shared modules, reducing duplication between history and seek views.

## [10.3.0] — 2026-02-09 — Time Travel (`git warp seek`)

Adds cursor-based time travel for exploring graph history. Navigate to any Lamport tick, save/load named bookmarks, and see materialized state at any point in time. Existing commands (`info`, `materialize`, `history`, `query`) respect the active cursor.

### Added

- **`git warp seek` command**: Step through graph history by Lamport tick.
  - `seek --tick N` — position cursor at absolute tick N.
  - `seek --tick=+N` / `seek --tick=-N` — step forward/backward relative to current position.
  - `seek --latest` — clear cursor and return to the present (latest state).
  - `seek --save NAME` / `seek --load NAME` — save and restore named cursor bookmarks.
  - `seek --list` — list all saved cursors.
  - `seek --drop NAME` — delete a saved cursor.
  - `seek` (bare) — show current cursor status.
- **`WarpGraph.discoverTicks()`**: Walks all writer patch chains reading only commit messages (no blob deserialization) to extract sorted Lamport timestamps and per-writer tick breakdowns.
- **`materialize({ ceiling })` option**: Replays only patches with `lamport <= ceiling`, enabling time-travel materialization. Skips auto-checkpoint when ceiling is active to avoid writing snapshots of past state.
- **Cursor persistence via refs**: Active cursor stored at `refs/warp/<graph>/cursor/active`, saved cursors at `refs/warp/<graph>/cursor/saved/<name>`. All data stored as JSON blobs.
- **ASCII seek renderer** (`src/visualization/renderers/ascii/seek.js`): Dashboard view with timeline visualization, writer inclusion status, and graph stats at the selected tick. Activated via `--view`.
- **Cursor-aware existing commands**: `info` shows active cursor in summary; `materialize` skips checkpointing when a cursor is active; `history` filters patches to the selected tick; `query` materializes at the cursor ceiling.
- **BATS CLI tests** (`test/bats/cli-seek.bats`, 10 tests): End-to-end integration tests for all seek operations.
- **Domain unit tests** (`test/unit/domain/WarpGraph.seek.test.js`, 12 tests): `discoverTicks()`, `materialize({ ceiling })`, ceiling caching, multi-writer ceiling, `_seekCeiling` instance state.
- **Renderer unit tests** (`test/unit/visualization/ascii-seek-renderer.test.js`, 7 tests): Timeline rendering, writer rows, dashboard layout.

### Changed

- **`RefLayout`**: New helpers `buildCursorActiveRef()`, `buildCursorSavedRef()`, `buildCursorSavedPrefix()` for cursor ref path construction.

### Fixed

- **Cursor blob validation**: Added `parseCursorBlob()` utility that validates JSON structure and numeric tick before use. `readActiveCursor`, `readSavedCursor`, and `listSavedCursors` now throw descriptive errors on corrupted cursor data instead of crashing.
- **GUIDE.md**: Added `--view seek` to the supported commands table.
- **CHANGELOG**: Fixed `RefLayout` helper names to match exported API (`buildCursorActiveRef`, not `buildCursorRef`).
- **`_materializeWithCeiling` cache**: Cache fast-path no longer returns empty `receipts: []` when `collectReceipts` is true; falls through to full materialization to produce real receipts.
- **`_resolveCeiling` null override**: `materialize({ ceiling: null })` now correctly clears `_seekCeiling` and materializes latest state, instead of ignoring the explicit null.
- **Seek timeline duplicate 0**: `buildSeekTimeline` no longer prepends tick 0 when `ticks` already contains it, preventing a duplicate dot in the timeline.
- **Seek timeline label drift**: Tick labels now stay vertically aligned under their dots for multi-digit tick values by computing target column positions instead of using fixed-width padding.
- **RefLayout docstring**: Added `cursor/active` and `cursor/saved/<name>` to the module-level ref layout listing.
- **BATS seek tests**: Use `--tick=+1` / `--tick=-1` syntax instead of `--tick +1` / `--tick -1` to avoid parser ambiguity with signed numbers.

### Tests

- Suite total: 2938 tests across 147 vitest files + 66 BATS CLI tests (up from 2883/142 + 56).
- New seek tests: 23 unit (14 domain + 9 renderer) + 10 BATS CLI = 33 total.
- New parseCursorBlob unit tests: 11 tests covering valid parsing, corrupted JSON, missing/invalid tick.

## [10.2.1] — 2026-02-09 — Compact ASCII graphs & hero GIF

### Changed

- **Compact ASCII node rendering**: Nodes are now 3 rows (border + label + border) instead of variable-height boxes, producing much denser graph output.
- **Tighter ELK layout spacing**: `nodeNode` reduced from 40→30, `betweenLayers` from 60→40, `NODE_HEIGHT` from 40→30 across all layout presets.
- **ASCII cell scaling**: `CELL_W` changed from 8→10 and `CELL_H` from 4→10 for better proportions with compact nodes.
- **Hero GIF revamp**: New Catppuccin Mocha theme, 6 scenes (empty log, info, query, path, warp refs, commit DAG), wider terminal (960×520).
- **README hero GIF**: Embedded `hero.gif` at the top of `README.md`.

## [10.2.0] — 2026-02-09 — Multi-runtime test matrix

Adds a Dockerized multi-runtime test suite across Node 20, Node 22, Bun, and Deno. Fixes the `materialize` CLI command crashing when creating checkpoints. Expands end-to-end coverage from 8 BATS tests and 7 integration tests to 56 BATS tests and 54 integration tests.

### Added

- **Multi-runtime Docker test matrix**: Four Dockerfiles (`docker/Dockerfile.{node20,node22,bun,deno}`) and a `docker-compose.test.yml` with profile-based orchestration. Unit + integration + BATS on Node 20/22; API integration on Bun and Deno. Run `npm run test:matrix` for all runtimes in parallel, or target individual runtimes via `npm run test:node20`, `test:node22`, `test:bun`, `test:deno`.
- **API integration test suite** (`test/integration/api/`, 10 files, 47 tests): Exercises the full programmatic API against real Git repos — lifecycle, multi-writer CRDT merge, query builder, traversals (BFS/DFS/shortest-path), checkpoints, tombstone GC, fork, edge cases (unicode IDs, self-edges, large properties), writer discovery, and sync.
- **Deno test wrappers** (`test/runtime/deno/`, 7 files): Standalone `Deno.test()` wrappers using `assertEquals`/`assert` from `std/assert`, covering lifecycle, multi-writer, query, traversal, checkpoint, edge cases, and tombstones. Uses `WebCryptoAdapter` for runtime-agnostic crypto.
- **Expanded BATS CLI tests** (`test/bats/`, 9 new files, 48 new tests): `cli-info`, `cli-query`, `cli-path`, `cli-history`, `cli-check`, `cli-materialize`, `cli-view-modes`, `cli-errors`, `cli-multiwriter`. Shared helpers extracted to `test/bats/helpers/setup.bash` with reusable seed scripts (`seed-graph.js`, `seed-multiwriter.js`, `seed-rich.js`).
- **Runtime-agnostic test helper** (`test/integration/api/helpers/setup.js`): Creates temp Git repos with `WebCryptoAdapter` pre-configured; works on Node, Bun, and Deno.
- **npm scripts**: `test:node20`, `test:node22`, `test:bun`, `test:deno`, `test:matrix`.

### Fixed

- **`materialize` CLI crash**: `WarpGraph.open()` calls in `openGraph()`, `materializeOneGraph()`, and the info handler's writer-patch lookup were missing the `crypto` option, causing `createCheckpoint()` to fail with "Invalid stateHash: expected string, got object". Now passes `NodeCryptoAdapter` in all three call sites.
- **`--graph nonexistent` silently succeeds**: `openGraph()` now validates that the specified graph exists before opening it, returning a proper `E_NOT_FOUND` error.
- **`--view html:FILE` not writing file**: The `html:FILE` view mode was accepted by the parser but never handled in `emit()`. Now wraps rendered SVG in an HTML document and writes it to the specified path (query and path commands).
- **BATS test key mismatch**: Materialize tests referenced `data["results"]` but the CLI outputs `data["graphs"]`. Fixed in `cli-materialize.bats` and `cli-multiwriter.bats`.
- **BATS path-not-found exit code**: `path not found` test expected exit 0, but the CLI intentionally returns exit 2 (`NOT_FOUND`). Fixed assertion in `cli-path.bats`.

### Changed

- **CI matrix strategy**: `.github/workflows/ci.yml` replaced the single Node 22 test job with a matrix strategy (`test-node` on Node 20+22, `test-bun`, `test-deno`), all using `docker-compose.test.yml`.
- **Extract `writeHtmlExport` helper**: Deduplicated the HTML wrapper template in `emit()` (query and path branches) into a shared `writeHtmlExport()` function.
- **Docker images run as non-root**: All four test images (`node20`, `node22`, `bun`, `deno`) now run tests as a non-root user to mirror CI environments and catch permission issues early.
- **Docker `--no-install-recommends`**: All Dockerfiles use `--no-install-recommends` to reduce image size and build time.
- **Pin Deno base image**: `Dockerfile.deno` now uses `denoland/deno:2.1.9` instead of `latest` for reproducible builds (the short `2.1` tag does not exist on Docker Hub).
- **Add `--build` to individual runtime scripts**: `test:node20`, `test:node22`, `test:bun`, `test:deno` now include `--build` so Dockerfile changes are always picked up.
- **Extract shared BATS seed setup**: Duplicated boilerplate (project root resolution, dynamic imports, persistence creation) extracted to `test/bats/helpers/seed-setup.js`.
- **Remove redundant CI Node.js setup**: `test-node` job no longer installs Node/npm on the host — tests run entirely in Docker, saving ~30-60s per matrix entry.
- **Fix `opts` spread order in test helpers**: Spread `...opts` before explicit params so callers cannot accidentally override `persistence`, `graphName`, `writerId`, or `crypto`.
- **Guard `cd` commands in BATS setup**: Added `|| return 1` to all `cd` calls in `setup.bash` to fail fast per ShellCheck SC2164.
- **Pin Bun base image**: `Dockerfile.bun` now uses `oven/bun:1.2-slim` instead of `latest` for reproducible builds.
- **Explicit `--view ascii` in BATS tests**: All `--view` invocations now pass the `ascii` mode explicitly rather than relying on the implicit default when the next token is a known command. Applied across `cli-check.bats`, `cli-query.bats`, and `cli-view-modes.bats`.
- **BATS multiwriter materialize**: Added missing `--graph demo` flag to the materialize test.
- **BATS info temp dir cleanup**: Empty-repo test now uses `trap ... RETURN` to clean up temp directory on assertion failure.
- **BATS seed scripts include crypto**: All `WarpGraph.open()` calls in seed scripts now pass `NodeCryptoAdapter` via the shared `seed-setup.js` module, matching the CLI and preventing `createCheckpoint()` crashes.
- **Stricter HTML export BATS test**: `--view html:FILE` test now asserts `<!DOCTYPE` and `<html` instead of falling back to `<svg`, ensuring raw SVG cannot pass as valid HTML output.
- **Deno Docker cache permissions**: `Dockerfile.deno` now chowns `/deno-dir` (Deno's global cache) to the `deno` user, fixing `Permission denied` errors when Deno fetches npm packages at runtime.

### Docs

- **JSDoc on changed/new functions**: Added missing JSDoc to `getGraphInfo`, `openGraph`, `writeHtmlExport`, `emit`, `materializeOneGraph` in `bin/warp-graph.js` and inner `openGraph` in `test/integration/api/helpers/setup.js`.

### Tests

- Suite total: 2883 tests across 142 vitest files + 56 BATS CLI tests (up from 2828/131 + 8).
- New API integration tests: 48 (lifecycle 6, multiwriter 4, querybuilder 7, traversal 7, checkpoint 3, tombstone-gc 4, fork 2, edge-cases 6, writer-discovery 5, sync 4).
- New BATS CLI tests: 48 (info 5, query 8, path 5, history 3, check 5, materialize 4, view-modes 7, errors 6, multiwriter 5).
- Deno integration tests: 18 (lifecycle 3, multiwriter 2, querybuilder 3, traversal 3, checkpoint 2, edge-cases 3, tombstone 2).

## [10.1.2] — 2026-02-08 — First public release

First publication to npm and JSR. Adds dual-registry CI/CD release system, broken link checking, and JSR compatibility fixes.

### Added

- **Dual-publish release workflow**: Tag-triggered CI pipeline (`release.yml`) that verifies metadata, publishes to npm and JSR in parallel via OIDC trusted publishing (no tokens), and creates a GitHub Release with auto-generated notes. Includes prerelease lane support (`rc`→`next`, `beta`→`beta`, `alpha`→`alpha` dist-tags).
- **Release preflight workflow**: `release-pr.yml` runs on every PR to main — lint, test, dry-run pack + JSR publish, and posts a predicted dist-tag comment.
- **Tag guard workflow**: `tag-guard.yml` rejects malformed non-semver tags before they trigger anything.
- **Reusable retry composite action**: `.github/actions/retry/action.yml` with linear backoff for registry publishes.
- **Broken link checker (lychee)**: `.lychee.toml` config for offline local-link validation; `.github/workflows/links.yml` CI workflow on markdown changes; `lint:links` npm script; pre-push hook runs lychee (graceful skip if not installed).
- **Release runbook**: `docs/release.md` with first-time OIDC setup steps and dist-tag mapping table.
- **`test:watch` and `test:coverage`** npm scripts.
- **JSR module docs**: `@module` JSDoc on all three jsr.json entrypoints (`.`, `./node`, `./visualization`).
- **JSR type declarations**: `@ts-self-types` directives on all entrypoints; new `GraphNode.d.ts` and `src/visualization/index.d.ts` for full "no slow types" compliance.

### Fixed

- **`no-misused-promises` lint errors**: `WarpGraph.js` polling `setInterval` and `NodeHttpAdapter.js` `createServer` callback now properly handle async returns via `.catch()` chains.
- **JSR `strip-ansi` module resolution**: Inlined the ANSI regex from `ansi-regex@6`/`strip-ansi@7` into `src/visualization/utils/ansi.js` — eliminates undeclared transitive dependency that JSR's module graph builder could not resolve.
- **Script recursion in Docker**: `test` and `benchmark` npm scripts now call `test:local`/`benchmark:local` inside Docker instead of recursing into themselves.
- **`postinstall` consumer failure**: Replaced with `prepare` (only runs in dev + before pack/publish) so consumers don't need `patch-package` or the `patches/` directory.

### Changed

- **package.json hardened for npm publish**: sharpened description, expanded keywords, added `sideEffects: false`, `publishConfig.access: "public"`, `packageManager: "npm@10"`, explicit `"import"` entries in exports, `"./package.json"` export, `prepack` quality gate (lint + test:local).
- **`patch-package` moved to devDependencies**: Build-time tool, not needed by consumers.
- **`@types/node` added to devDependencies**.
- **Removed `typesVersions`**: Redundant with `"types"` in export map (TS 4.7+).
- **CI triggers on version tags**: `ci.yml` now runs the full suite (Docker tests + BATS CLI) on `v*` tag pushes so the release workflow can gate on CI completion.

### Tests

- Suite total: 2828 tests across 131 files (unchanged).

## [10.1.1] — 2026-02-08 — BULKHEAD (cont.)

### Documentation

- **JSDoc audit across domain services**: Added missing `@param` tags for `codec` and `crypto` options in `BitmapIndexBuilder`, `BitmapIndexReader`, `CheckpointService`, `WarpGraph` constructor and `open()`. Documented `BlobValue` op type in `JoinReducer.applyOpV2`. Documented `shortestPath` failure return and `connectedComponent.maxDepth` in `LogicalTraversal`. Typed `getCurrentState` and `onCommitSuccess` callbacks in `Writer`.
- **JSDoc for visualization layer**: Added JSDoc to all undocumented exports in `renderers/ascii/` (`createBox`, `progressBar`, `createTable`) and `utils/` (`stripAnsi`, `timeAgo`, `formatDuration`, `truncate`, `padRight`, `padLeft`, `center`).
- **`WarpGraph.js` JSDoc fixes**: Added `@param httpPort` and `@throws` to `serve()`. Added 2 missing `@throws` codes to `fork()`. Fixed `TickReceipt` import path (`../types/` → `./types/`).
- **`index.d.ts` critical fixes**: Fixed 6 methods incorrectly declared as synchronous (`getNodes`, `getEdges`, `getNodeProps`, `getEdgeProps`, `hasNode`, `neighbors` — all return `Promise`). Removed nonexistent `getVersionVector()`. Added missing params to `open()` (`onDeleteWithData`, `clock`, `crypto`, `codec`), `serve()` (`httpPort`), and `BitmapIndexReader` (`crypto`). Added `maxDepth` to `connectedComponent` options.
- **`index.d.ts` completeness**: Added 18 missing public `WarpGraph` method declarations (`writer()`, `subscribe()`, `watch()`, `status()`, `syncCoverage()`, `createSyncRequest()`, `processSyncRequest()`, `applySyncResponse()`, `syncNeeded()`, `maybeRunGC()`, `runGC()`, `getGCMetrics()`, `join()`, `createWriter()`, getters for `persistence`, `onDeleteWithData`, `gcPolicy`, `temporal`). Added supporting type declarations (`StateDiffResult`, `Writer`, `PatchSession`, `WriterError`, GC types, sync protocol types, `TemporalQuery`, `TemporalNodeSnapshot`). Added 9 missing runtime export declarations (`createNodeAdd`, `createNodeTombstone`, `createEdgeAdd`, `createEdgeTombstone`, `createPropSet`, `createInlineValue`, `createBlobValue`, `createEventId`, `migrateV4toV5`) with supporting op/value types.

### Fixed

- **`NodeCryptoAdapter.hash()` / `hmac()` now use `async`**: Previously used `Promise.resolve()` wrapping, which let synchronous throws (e.g. unsupported algorithm) escape as uncaught exceptions instead of rejected promises. Now properly `async` so all errors become rejections.
- **`index.d.ts` HttpServerPort type declarations**: `listen()`, `close()`, and `address()` signatures now match the actual callback-based implementation. Previously declared a Promise-based options-object API that no adapter implemented.
- **`PatchBuilderV2` silent catch now logs**: The empty `catch {}` around `onCommitSuccess` now captures the error and logs it via `this._logger.warn()` with the commit SHA, aiding debugging when eager re-materialize fails. Accepts optional `logger` constructor param (defaults to `nullLogger`).
- **`DenoHttpAdapter.addressImpl()` type guard**: `state.server.addr` is now guarded against non-`NetAddr` types (`UnixAddr`, `VsockAddr`) by checking `addr.transport` before destructuring `hostname`/`port`. Returns `null` for non-TCP/UDP addresses.
- **`DenoHttpAdapter` / `BunHttpAdapter` streaming body size limit**: Both adapters now enforce `MAX_BODY_BYTES` (10 MB) via `request.body.getReader()` streaming instead of `request.arrayBuffer()`. This prevents memory exhaustion from chunked requests without `Content-Length` — the reader aborts after 10 MB instead of buffering the entire payload. Also pre-checks `Content-Length` header when present.
- **`NodeHttpAdapter` destroys request on 413**: After responding with 413 Payload Too Large, `req.destroy()` is now called to tear down the socket and stop buffering the remaining payload.
- **`BoundaryTransitionRecord` `hexToUint8Array` validation**: Now throws `RangeError` on odd-length, non-string, or invalid hex character input (e.g. `'GG'`). Previously, `parseInt('GG', 16)` returned `NaN` which silently coerced to `0` in the `Uint8Array`, allowing malformed authentication tags. `verifyBTR` now catches the `RangeError` and returns `{valid: false, reason: 'Invalid hex ...'}` instead of the misleading "Authentication tag mismatch".
- **`index.d.ts` `computeStateHashV5` signature**: `options` and `crypto` are now optional, matching the implementation which defaults to `{}` and returns `null` when crypto is absent.
- **`index.d.ts` `replayBTR` signature**: Added missing second `options?: { crypto?: CryptoPort; codec?: unknown }` parameter, matching the implementation.
- **`BoundaryTransitionRecord` JSDoc types**: Updated 7 `@param`/`@returns`/`@property` annotations from `Buffer` to `Uint8Array` to accurately reflect cross-runtime support via `WebCryptoAdapter`.
- **`index.d.ts` BTR type declarations**: `BTR.U_0`, `serializeBTR` return type, and `deserializeBTR` parameter type changed from `Buffer` to `Uint8Array`, matching the cross-runtime implementation.
- **`DenoHttpAdapter.closeImpl()` shutdown error handling**: `state.server` is now nullified in the rejection path, preventing stale references after a failed shutdown. Also prevents unhandled promise rejection when `close()` is called without a callback.
- **`ReducerV5.benchmark.js` stale comment**: Removed reference to hard CI limits that were previously removed.
- **`WarpStateIndexBuilder` JSDoc examples**: Added missing `await` to `builder.serialize()` and `buildWarpStateIndex()` examples, which became async in v10.1.0.
- **`WarpGraph.fork()` now propagates `crypto` and `codec`**: Previously, forked graphs lost the parent's `crypto` and `codec` options, causing `computeStateHashV5` to return `null` and dropping custom codecs. Now forwards both to `WarpGraph.open()`.
- **`DenoHttpAdapter.listen()` re-throws on bind failure without callback**: Previously, if `Deno.serve()` threw and no callback was provided, the error was silently swallowed. Now re-throws so callers are informed of bind failures.
- **`formatDuration()` input validation**: Now returns `'unknown'` for non-numeric, `NaN`, and negative inputs (consistent with `timeAgo`). Also added hour-level formatting for durations >= 60 minutes.
- **`box.js` removed redundant default export**: `export default { createBox }` wrapped the named export in an object; all consumers use the named import. Removed to avoid confusion.
- **`index.d.ts` HTTP adapter logger type**: `BunHttpAdapter` and `DenoHttpAdapter` constructor `logger.error` now accepts variadic `...args: unknown[]`, matching the implementation which calls `logger.error(msg, err)`.
- **`DenoHttpAdapter.listenImpl()` simplified**: Removed unnecessary intermediate closure — logic is now inlined at the call site.
- **`BunHttpAdapter` `ERROR_BODY_LENGTH`**: Now derived from `TextEncoder().encode().byteLength` instead of `String.length`, correctly measuring bytes rather than UTF-16 code units.

### Tests

- Benchmark consistency: All `runBenchmark()` calls in `Compaction.benchmark.js` and `ReducerV5.benchmark.js` now pass `WARMUP_RUNS` and `MEASURED_RUNS` explicitly instead of relying on matching defaults.
- `createMockClock`: `timestamp()` now captures-then-advances (like `now()`) instead of reading the already-advanced time. Prevents silent disagreement when both methods are called to represent the same instant.
- `createMockClock.test.js`: New test file validating `now()`/`timestamp()` consistency and independent clock advancement.
- `createGitRepo`: Temp directory is now cleaned up in a `catch` block if git init or config fails, preventing CI temp dir accumulation.
- `setupGraphState`: Added coupling comment documenting reliance on `WarpGraph._cachedState` internal field.
- `BunHttpAdapter` `startServer` JSDoc: Added note about `Bun.serve()` synchronous callback timing differing from Node's async `server.listen`.
- `WarpGraph.forkCryptoCodec.test.js`: New test file validating that `fork()` propagates `crypto` and `codec` to forked graphs (3 tests).
- `DenoHttpAdapter.test.js`: Added tests for listen throw-without-callback, close rejection without callback, and state.server nullification on shutdown error (3 new tests).
- `visualization-utils.test.js`: Added tests for `formatDuration` edge cases: `NaN`, negative, non-numeric, and hour-level formatting (5 new tests).
- Suite total: 2828 tests across 131 files.

## [10.1.0] — 2026-02-06 — BULKHEAD (cont.)

### Breaking Changes

- **`CryptoPort.hash()` and `CryptoPort.hmac()` are now async**: Both methods now return `Promise<string>` and `Promise<Buffer|Uint8Array>` respectively, enabling Web Crypto API support across browsers, Deno, and Bun. All domain callers updated to `await`. If you have a custom `CryptoPort` implementation, update `hash()` and `hmac()` to return Promises (or mark them `async`).
- **Functions that were synchronous are now async**: `computeStateHashV5()`, `BitmapIndexBuilder.serialize()`, `WarpStateIndexBuilder.serialize()`, `buildWarpStateIndex()`, `createBTR()`, `verifyBTR()`, `replayBTR()`. All return Promises and must be `await`ed.

### Added

- **`WebCryptoAdapter`**: New `CryptoPort` implementation using the standard Web Crypto API (`globalThis.crypto.subtle`). Works in browsers, Deno, Bun, and Node.js 20+. Includes XOR-based constant-time comparison for environments without `crypto.timingSafeEqual`.
- **`BunHttpAdapter`**: New `HttpServerPort` implementation using `Bun.serve()`. Bridges between Bun's `Request`/`Response` API and the port's plain-object contract. Includes error handling with 500 responses.
- **`DenoHttpAdapter`**: New `HttpServerPort` implementation using `Deno.serve()`. Same bridging pattern as `BunHttpAdapter`, with graceful shutdown support.
- **`CommitPort.commitNodeWithTree()`**: New method for creating commits pointing to a specified tree (used by `CheckpointService` and `PatchBuilderV2`).
- **`CommitPort.nodeExists()`**: New method for checking whether a commit exists.
- **`RefPort.listRefs()`**: New method for listing refs matching a prefix.

### Refactored

- **Port composition via prototype mixin**: `GraphPersistencePort` and `IndexStoragePort` are now composed from their focused ports (`CommitPort`, `BlobPort`, `TreePort`, `RefPort`, `ConfigPort`) via prototype descriptor copying, replacing ~300 lines of duplicated method stubs. Collision detection prevents silent shadowing. `GraphPersistencePort` remains the backward-compatible composite — existing `GitGraphAdapter` implementations require no changes.
- **`NodeHttpAdapter` error handling**: Extracted `dispatch()` helper that wraps request handling in try/catch and returns 500 on unhandled errors, preventing silent connection hangs.
- **Test DRY refactoring**: 22 test files migrated to shared helpers from `test/helpers/warpGraphTestUtils.js` (`createMockPersistence`, `createMockLogger`, `createMockClock`, `createGitRepo`, `addNodeToState`, `addEdgeToState`, `setupGraphState`). New `test/benchmark/benchmarkUtils.js` consolidates benchmark utilities (`TestClock`, `median`, `forceGC`, `logEnvironment`, `randomHex`, `runBenchmark`). Net reduction of ~400 lines across test files.

### Tests

- Added `GraphPersistencePort.test.js` — validates prototype mixin composition, collision detection, and focused port coverage
- Updated `CryptoPort.test.js` for async `hash()`/`hmac()` semantics
- Suite total: 2837 tests across 132 files

## [10.0.0] — BULKHEAD

### Added

#### BULKHEAD — Hexagonal Architecture Hardening (v10.0.0)

Architectural hardening milestone that eliminates all hexagonal boundary violations — domain code no longer imports from Node.js built-ins or concrete infrastructure adapters. This unblocks multi-runtime publishing (JSR/Deno/Bun).

- **Port injection for codec** (`BK/WIRE/2`): All domain services now accept `codec` via dependency injection instead of importing `CborCodec` directly. Domain-local `defaultCodec.js` provides a fallback using `cbor-x` directly. Pattern: `this._codec = codec || defaultCodec`.
- **Port injection for crypto** (`BK/WIRE/1`): All domain services now accept `crypto` via `CryptoPort` instead of importing `node:crypto`. Graceful degradation: `computeChecksum()` and `computeStateHashV5()` return `null` when no crypto adapter is provided.
- **Hex boundary violations eliminated** (`BK/WIRE/3`): Zero imports from `node:crypto`, `node:http`, `node:module`, `node:path`, `node:url`, or `perf_hooks` in `src/domain/`. All infrastructure access goes through injected ports.
- **Consolidated clock adapter** (`BK/DRY/2`): Merged `PerformanceClockAdapter` and `GlobalClockAdapter` into single `ClockAdapter` with constructor DI and factory statics (`ClockAdapter.node()`, `ClockAdapter.global()`). Old adapter files are now re-export shims marked `@deprecated`.
- **Five focused persistence ports** (`BK/SRP/4`): Split `GraphPersistencePort` (14+ methods) into `CommitPort`, `BlobPort`, `TreePort`, `RefPort`, and `ConfigPort`. `GraphPersistencePort` remains as backward-compatible composite. Domain services document their minimal port surface via JSDoc.
- **`CodecPort` interface** (`BK/PORT/1`): New abstract port for encode/decode operations.
- **`CryptoPort` interface** (`BK/PORT/2`): New abstract port for hash/HMAC operations.
- **`HttpServerPort` interface** (`BK/PORT/3`): New abstract port for HTTP server operations.
- **`NodeCryptoAdapter`**: Infrastructure adapter implementing `CryptoPort` using `node:crypto`.
- **`NodeHttpAdapter`**: Infrastructure adapter implementing `HttpServerPort` using `node:http`.
- **`defaultCodec.js`**: Domain-local CBOR codec using `cbor-x` directly (no infrastructure import).
- **`defaultClock.js`**: Domain-local clock using `globalThis.performance`.
- **`nullLogger.js`**: Domain-local no-op `LoggerPort` for silent defaults.
- **Domain service decomposition** (`BK/SRP/1-3`): `WarpMessageCodec` split into focused sub-codecs (`AnchorMessageCodec`, `CheckpointMessageCodec`, `PatchMessageCodec`, `MessageCodecInternal`, `MessageSchemaDetector`). `CommitDagTraversalService` split into `DagTraversal`, `DagTopology`, `DagPathFinding`. `HttpSyncServer` extracted from `SyncProtocol`.
- **`KeyCodec`** (`BK/SRP/2`): Extracted key encoding/decoding from `JoinReducer` into standalone service.
- **Error hierarchy** (`BK/ERR/1`): All domain errors now extend `WarpError` base class. New `WriterError` for writer-specific failures.

### Tests

- Added port contract tests: `CodecPort.test.js`, `CryptoPort.test.js`, `HttpServerPort.test.js`, `CommitPort.test.js`, `BlobPort.test.js`, `TreePort.test.js`, `RefPort.test.js`, `ConfigPort.test.js`
- Added `WarpError.test.js`, `WriterError.test.js`, `KeyCodec.test.js`, `HttpSyncServer.test.js`
- Added shared ASCII renderer test: `ascii-shared.test.js`
- Updated all existing test files to inject `NodeCryptoAdapter` where crypto is needed
- Suite total: 2725 tests across 126 files

## [9.0.0] — ECHO

### Added

#### ECHO — Observer Geometry (v9.0.0)

Implements [Paper IV](https://doi.org/10.5281/zenodo.18038297) (Echo and the WARP Core) from the AION Foundations Series: observer-scoped views, temporal queries, and translation cost estimation.

- **Observer-scoped views** (`EC/VIEW/1`): New `graph.observer(name, config)` returns a read-only `ObserverView` projecting the materialized graph through an observer lens. Config accepts `match` (glob pattern for visible nodes), `expose` (property key whitelist), and `redact` (property key blacklist — takes precedence over expose). The view supports the full query/traverse API: `hasNode()`, `getNodes()`, `getNodeProps()`, `getEdges()`, `query()`, and `traverse.*` (BFS, DFS, shortestPath). Edges are only visible when both endpoints pass the match filter. Requires materialized state.
- **Temporal query operators** (`EC/TEMPORAL/1`): New `graph.temporal.always(nodeId, predicate, { since })` and `graph.temporal.eventually(nodeId, predicate, { since })` implement CTL*-style temporal logic over patch history. Both operators replay patches incrementally, extracting node snapshots at each tick boundary and evaluating the predicate. `always` returns true only if the predicate held at every tick where the node existed. `eventually` short-circuits on the first true tick. The `since` option filters by Lamport timestamp. Predicates receive `{ id, exists, props }` with unwrapped property values.
- **Translation cost estimation** (`EC/COST/1`): New `graph.translationCost(configA, configB)` computes the directed MDL (Minimum Description Length) cost of translating observer A's view into observer B's view. Returns `{ cost, breakdown: { nodeLoss, edgeLoss, propLoss } }` normalized to [0, 1]. Weights: node loss 50%, edge loss 30%, property loss 20%. Identical views produce cost 0; completely disjoint views produce cost 1. The cost is asymmetric: `cost(A→B) ≠ cost(B→A)` in general.

#### Visualization M2 — History, Path, Materialize Renderers (v7.8.1)

- **`git warp --view history`**: Patch timeline renderer with operation summaries, pagination, and node filtering. Shows per-patch operation counts (nodes added/removed, edges added/removed, properties set) with color-coded indicators.
- **`git warp --view path`**: Visual path diagram between two nodes with arrow connectors and edge labels. Supports line-wrapping for long paths and displays hop count.
- **`git warp --view materialize`**: Progress dashboard showing per-writer patch contribution bars, node/edge/property statistics with scaled bar charts, and checkpoint creation status.
- **`summarizeOps` export**: New public function from `history.js` for computing operation type counts from patch ops arrays.
- **`graph.getPropertyCount()`**: New public method on `WarpGraph` returning the number of property entries in materialized state, replacing direct `_cachedState` access in the CLI.
- **Enriched `handleMaterialize` payload**: CLI now populates `writers` (per-writer patch counts), `properties`, and `patchCount` fields for the view renderer.
- **Enriched `handleHistory` payload**: CLI now includes `opSummary` in history entries for real operation summaries instead of `(empty)` fallbacks.

### Documentation

- **GUIDE.md comprehensive rewrite**: Restructured from concept-first reference manual to progressive-disclosure user guide. Quick Start with full working example now at the top. New sections: Writing Data (Writer API, PatchSession, edge properties, onDeleteWithData), Reading Data (all query methods), Graph Traversals (BFS, DFS, shortest path, connected component), Forks, Wormholes, Provenance, Slice Materialization, GC, Bitmap Indexes, Sync Protocol, CLI, Git Hooks. Internal CRDT details moved from user-facing examples to 8 appendixes (Conflict Resolution Internals, Git Ref Layout, Patch Format, Error Code Reference, Tick Receipts, Sync Protocol, Garbage Collection, Bitmap Indexes). Scrubbed raw `WarpStateV5` shapes from user-facing sections; all examples now use the public API (`hasNode`, `getNodeProps`, etc.).
- **JSDoc hygiene pass**: Added or fixed JSDoc across 8 source files:
  - `MigrationService.js`: Added full JSDoc to exported `migrateV4toV5` function; fixed ESLint `no-unnecessary-boolean-literal-compare` errors.
  - `BoundaryTransitionRecord.js`: Added `@param`/`@returns` to `validateBTRStructure`, `verifyHmac`, `verifyReplayHash` (previously bare `@private`).
  - `WormholeService.js`: Added full JSDoc to `collectPatchRange` helper.
  - `LogicalTraversal.js`: Added class-level JSDoc block.
  - `HookInstaller.js`: Added JSDoc to `extractVersion` and 5 module-level helpers; added `@private` to 9 class methods; fixed incomplete `getHookStatus` return type (added `foreign?`, made `current` optional).
  - `GlobalClockAdapter.js`, `PerformanceClockAdapter.js`: Added `@extends ClockPort` to class JSDoc.

### Tests

- Added `test/unit/domain/services/ObserverView.test.js` (23 tests) — node visibility, property filtering, edge visibility, query/traverse through observer
- Added `test/unit/domain/services/TemporalQuery.test.js` (23 tests) — always/eventually operators, acceptance criteria, multi-writer scenarios
- Added `test/unit/domain/services/TranslationCost.test.js` (16 tests) — identical/disjoint/subset configs, property redaction, edge loss, normalization
- Total new tests: 62. Suite total: 2410 tests across 106 files.

### TypeScript

- Added `ObserverConfig`, `ObserverView`, `TemporalQuery`, `TranslationCostBreakdown`, `TranslationCostResult` type declarations
- Added `observer()`, `translationCost()`, and `temporal` getter to `WarpGraph` class

## [8.0.0] — HOLOGRAM

### Breaking Changes

- **`patchesFor()` is now async**: `patchesFor(entityId)` now uses `_ensureFreshState()` like other query methods, so it auto-materializes when `autoMaterialize` is enabled. The return type changed from `string[]` to `Promise<string[]>` — all call sites must be `await`ed.

### Added

#### HOLOGRAM — Provenance & Holography (v8.0.0)

Implements [Paper III](https://doi.org/10.5281/zenodo.17963669) (Computational Holography & Provenance Payloads) and [Paper IV](https://doi.org/10.5281/zenodo.18038297) (Rulial Distance & Observer Geometry) from the AION Foundations Series: provenance payloads, slicing, wormholes, BTRs, and prefix forks.

- **Patch I/O declarations** (`HG/IO/1`): Patches now carry optional `reads` and `writes` string arrays for provenance tracking. Auto-populated during `commitPatch()` by inspecting ops: `NodeAdd(X)` writes X; `NodeRemove(X)` reads X; `EdgeAdd(A→B)` reads A, reads B, writes edge key; `EdgeRemove(A→B)` reads edge key; `PropSet(X, key)` reads and writes X. Backward compatible — legacy patches without fields load correctly.
- **Provenance index** (`HG/IO/2`): New `ProvenanceIndex` class maps node/edge IDs to contributing patch SHAs. New `graph.patchesFor(entityId)` returns all patches that affected an entity. Index built during materialization, persisted in checkpoints, updated incrementally on commit.
- **ProvenancePayload class** (`HG/PROV/1`): New `ProvenancePayload` class implements the boundary encoding `(U_0, P)` from Paper III as a first-class type with monoid operations. Constructor accepts ordered patch sequence. `concat(other)` for monoid composition. `static identity()` for empty payload. `replay(initialState?)` for deterministic materialization. Immutable after construction. Monoid laws verified. Additional utilities: `at()`, `slice()`, `toJSON()`, `fromJSON()`, and `Symbol.iterator`.
- **Slice materialization** (`HG/SLICE/1`): New `graph.materializeSlice(nodeId)` computes backward causal cone and materializes only patches that contributed to the target node. Uses BFS over ProvenanceIndex, topologically sorts patches by Lamport timestamp, replays via ProvenancePayload. Returns `{ state, patchCount, receipts? }`.
- **Wormhole compression** (`HG/WORM/1`): New `graph.createWormhole(fromSha, toSha)` compresses a range of patches into a single wormhole edge. Wormhole contains sub-payload (ProvenancePayload) for replay. `composeWormholes(first, second)` for monoid composition. `replayWormhole()` for materialization. New `WormholeError` class with typed error codes.
- **Boundary Transition Records** (`HG/BTR/1`): New BTR packaging format binds `(h_in, h_out, U_0, P, t, kappa)` for tamper-evident exchange. `createBTR(initialState, payload, { key })` creates signed records. `verifyBTR(btr, key)` validates HMAC and optional replay. CBOR serialization via `serializeBTR()`/`deserializeBTR()`.
- **graph.fork() API** (`HG/FORK/1`): New `graph.fork({ from, at, forkName?, forkWriterId? })` creates a forked graph at a specific point in a writer's chain. Fork shares history up to `at` commit (Git content-addressed dedup). Fork gets a new writer ID and operates independently. Mutual isolation verified. New `ForkError` class with typed error codes.

### Fixed

- **`materializeSlice` duplicate replay**: Fixed bug where `payload.replay()` was always called even when `collectReceipts` was true, causing double materialization. Now branches cleanly: uses `reduceV5()` directly when collecting receipts, `ProvenancePayload.replay()` otherwise.
- **`materializeSlice` double I/O optimization**: `_computeBackwardCone()` now returns `Map<sha, patch>` with already-loaded patches instead of `Set<sha>`, eliminating a second round of patch loading during slice materialization.
- **Fork parameter validation error codes**: Changed error codes from `E_FORK_WRITER_NOT_FOUND`/`E_FORK_PATCH_NOT_FOUND` to `E_FORK_INVALID_ARGS` for missing/invalid `from` and `at` parameters. These codes now properly distinguish between "missing argument" vs "entity not found after lookup".
- **Fork writer ID validation error code**: Changed error code from `E_FORK_NAME_INVALID` to `E_FORK_WRITER_ID_INVALID` when `forkWriterId` validation fails.
- **Fork name collision prevention**: Auto-generated fork names now include a 4-character random suffix (e.g., `graph-fork-1234567890-abcd`) to prevent collisions when two `fork()` calls happen within the same millisecond.
- **Consolidated full-state serialization**: `StateSerializerV5.serializeFullStateV5` and `deserializeFullStateV5` now delegate to `CheckpointSerializerV5`, ensuring BTR and Checkpoint use the same canonical format. Eliminates wire-format incompatibility between the two serializers.
- **`ProvenanceIndex` missing entries guard**: `deserialize()` and `fromJSON()` now throw `"Missing or invalid ProvenanceIndex entries"` if the entries field is undefined or not an array, instead of failing with cryptic iteration errors.
- **`ProvenanceIndex` deterministic iteration**: `[Symbol.iterator]` now uses `#sortedEntries()` to yield entities in deterministic sorted order, matching `toJSON()` and `serialize()` behavior.
- **`deserializeWormhole` structural validation**: Now validates JSON structure before constructing the wormhole, providing clear error messages for missing/invalid fields instead of cryptic failures deep in `ProvenancePayload.fromJSON`.
- **`patchesFor` auto-materialize alignment**: Now uses `_ensureFreshState()` for consistency with other query methods (see Breaking Changes above).
- **Remove misleading `Object.freeze` from `PatchBuilderV2`**: The `reads` and `writes` getters no longer call `Object.freeze()` on the returned Set since it doesn't prevent Set mutations anyway. The defensive copy is the real protection.
- **Error surfacing in `_loadPatchBySha`**: Errors during patch loading are now properly thrown instead of being swallowed, improving debuggability when patches fail to load.
- **Fresh state guard in `materializeSlice`**: Now ensures fresh state before accessing the provenance index, preventing stale index reads after writes.
- **Dirty state guard in `patchesFor`**: Added state guard to `patchesFor()` to throw `E_STALE_STATE` when cached state is dirty and `autoMaterialize` is off.
- **HMAC key validation in BTR**: `createBTR()` now validates that the HMAC key is provided and non-empty, throwing early on misconfiguration.
- **`ForkError` constructor null-safety**: Constructor now coalesces `options` before reading properties, so `new ForkError(msg, null)` no longer throws `TypeError`.
- **`deserializeFullStateV5` null buffer guard**: Now returns `createEmptyStateV5()` when buffer is null or undefined, instead of crashing inside `decode()`.
- **`deserializeFullStateV5` null-safe ORSet fields**: `nodeAlive` and `edgeAlive` now fall back to `{}` when missing from the decoded object, preventing `TypeError` in `orsetDeserialize()`.
- **Negative index support in `ProvenancePayload.at()`**: Negative indices now work correctly (e.g., `payload.at(-1)` returns the last patch), matching JavaScript array semantics.
- **Defensive copies from `PatchBuilderV2` getters**: The `reads` and `writes` getters now return frozen copies instead of the live internal Sets, preventing external mutation.
- **Forward `provenanceIndex` in `CheckpointService.create()`**: The `create()` wrapper now forwards the optional `provenanceIndex` parameter to `createV5()`, preventing silent data loss when using the convenience API.
- **Strip `writerId` from wormhole patches**: `createWormhole()` now strips the extraneous `writerId` field from patches before constructing `ProvenancePayload`, matching the documented `PatchEntry` type contract and reducing serialization size.
- **`ProvenanceIndex.fromJSON` defensive fallback**: Now passes `json.entries || []` to `#buildIndex()` so missing or undefined entries fall back to an empty array, consistent with `deserialize()` behavior.
- **`deserializeFullStateV5` version validation**: Now distinguishes null/undefined input (returns empty state) from version mismatch (throws `Error` with actual version). Serialized state now includes `version: 'full-v5'` for forward compatibility detection. Pre-versioned checkpoints remain loadable for backward compatibility.

### Refactored

- **Deduplicate `createEmptyStateV5`**: `CheckpointSerializerV5` now imports `createEmptyStateV5` from `JoinReducer.js` instead of reimplementing it locally.
- **`_computeBackwardCone` BFS optimization**: Replaced `queue.shift()` (O(n) per pop) with an index pointer for O(1) dequeue, avoiding quadratic behavior on large causal cones.
- **Extract `_onPatchCommitted` helper**: Consolidated the duplicated `onCommitSuccess` callback (from `createPatch()`, `writer()`, and `createWriter()`) into a single `_onPatchCommitted(writerId, opts)` method. Any future changes to post-commit behavior now happen in one place.
- **`ProvenanceIndex` DRY refactor**: Extracted common patterns in `ProvenanceIndex` to reduce duplication; added defensive copy on `getPatchesFor()` return value to prevent external mutation.
- **DRY up patch construction in `PatchBuilderV2`**: Have `commit()` use `createPatchV2()` for patch construction, consolidating the conditional reads/writes inclusion logic in one place.
- **Consolidate `REQUIRED_FIELDS` in `BoundaryTransitionRecord`**: Use the module-level constant in `deserializeBTR()` instead of a local duplicate.

### Documentation

- **Provenance semantics in `PatchBuilderV2`**: Added design note explaining why `removeNode`/`removeEdge` are tracked as reads (observed-dot dependencies) rather than writes (new data creation).
- **`loadCheckpoint` return type**: Updated JSDoc to include the optional `provenanceIndex` field in the documented return shape.
- **Updated `errors/index.js` module JSDoc**: Comment now correctly describes "domain operations" instead of stale "bitmap index operations".

### Tests
- Added provenance tracking tests to `PatchBuilderV2.test.js` (+20 tests)
- Added `test/unit/domain/services/ProvenancePayload.test.js` (49 tests) — monoid laws, replay verification, fuzz tests
- Added `test/unit/domain/services/ProvenanceIndex.test.js` (38 tests) — index construction, queries, serialization
- Added `test/unit/domain/services/WormholeService.test.js` (17 tests) — compression, composition, replay
- Added `test/unit/domain/services/BoundaryTransitionRecord.test.js` (42 tests) — creation, verification, tamper detection
- Added `test/unit/domain/WarpGraph.fork.test.js` (20 tests) — fork creation, isolation, edge cases
- Added `test/unit/domain/WarpGraph.patchesFor.test.js` (13 tests) — provenance queries
- Added `test/unit/domain/WarpGraph.materializeSlice.test.js` (19 tests) — causal cones, slice correctness
- Added `WormholeError` to index exports test coverage
- Added `test/unit/domain/errors/ForkError.test.js` (4 tests) — constructor null-safety, defaults
- Strengthened `CheckpointSerializerV5.test.js` (+6 tests) — edgeBirthEvent round-trip, legacy bare-lamport format, version mismatch error, edgeBirthEvent assertions on null/undefined/missing-field paths
- **Test quality improvements**:
  - Made `ProvenanceIndex` stress test deterministic by removing wall-clock timing assertion (performance testing belongs in benchmarks)
  - Deduplicated `createMockPersistence` helper in `PatchBuilderV2.test.js`
  - Consolidated doubled async assertions in `WarpGraph.fork.test.js` to avoid calling `graph.fork()` twice per test
  - Consolidated doubled async assertions in `WormholeService.test.js` (5 instances)
  - Created `test/helpers/warpGraphTestUtils.js` with shared utilities (OID generators, mock persistence, V2 operation helpers, patch factories) designed for parallel-safe execution
  - Refactored `patchesFor`, `materializeSlice`, `BoundaryTransitionRecord`, and `ProvenancePayload` tests to use shared utilities, removing ~250 lines of duplication
  - Fixed non-deterministic dates in test helpers — `createMockPatchWithIO` and `createMockPatch` now use fixed date `'2026-01-01T00:00:00.000Z'` instead of `new Date().toISOString()`
  - Fixed inconsistent SHA format in `createSamplePatches()` — now uses `generateOidFromNumber()` for 40-character OIDs instead of 8-character strings
  - Refactored `WormholeService.test.js` to use shared utilities from `warpGraphTestUtils.js`, eliminating ~100 lines of duplicated helpers
  - Converted 5 error tests in `WormholeService.test.js` from try/catch + `expect.fail()` to idiomatic `expect().rejects.toMatchObject()` pattern

### TypeScript

- **`ProvenanceIndex` type declarations**: Updated `index.d.ts` to match the runtime API:
  - Changed `toJSON()` return type to `{ version: number; entries: Array<[string, string[]]> }`
  - Changed `fromJSON()` parameter type to match
  - Changed `addPatch()` return type from `void` to `this`
  - Added missing methods: `static empty()`, `has()`, `entities()`, `clear()`, `merge()`, `serialize()`, `static deserialize()`, and `[Symbol.iterator]()`

## [7.8.0] - 2025-02-06

### Added
- **Visualization system** - New `--view` flag for visual ASCII output
  - `git warp --view info` - Graph overview with writer timelines and box-framed summaries
  - `git warp --view check` - Health dashboard with progress bars and status indicators
- Visualization module scaffold (`src/visualization/`) with ASCII renderers and utilities
- Snapshot tests for ASCII renderer output stability
- Dependencies: chalk, boxen, cli-table3, figures, string-width, wrap-ansi

## [7.7.1] — Documentation & Hardening

### Documentation

- **Comprehensive JSDoc pass**: Added or enhanced JSDoc documentation across the entire codebase.
  - **WarpGraph.js**: Added JSDoc to 3 helper functions, added `@throws` to ~15 async methods, added `@deprecated` to `createWriter()`, improved return types, enhanced `query()` with examples.
  - **JoinReducer.js**: Documented 19 functions including `applyOpV2`, outcome helpers, `join`, `joinStates`, `reduceV5`, `cloneStateV5`.
  - **PatchBuilderV2.js**: Enhanced all public methods with `@throws`, examples, and fluent return type documentation.
  - **QueryBuilder.js**: Added 17 helper function docs, 8 class method docs, new type definitions.
  - **LogicalTraversal.js**: Documented helper functions and standardized traversal method documentation.
  - **CRDT primitives**: Added module-level documentation explaining semilattice properties, add-wins semantics, GC safety invariants, EventId comparison logic.
  - **Services**: Documented `StreamingBitmapIndexBuilder`, `CommitDagTraversalService`, `IndexRebuildService`, `SyncProtocol` with comprehensive `@throws` and parameter docs.
  - **Infrastructure**: `GitGraphAdapter` module-level docs, retry strategy; `CborCodec` canonical encoding docs.
  - **Utilities & Errors**: `roaring.js`, `TickReceipt.js`, `QueryError`, `SyncError` with error code tables and examples.

### Fixed

- **StreamingBitmapIndexBuilder checksum compatibility**: Use `canonicalStringify` for deterministic checksums; bump `SHARD_VERSION` to 2 for reader compatibility; cache `RoaringBitmap32` constructor for performance.
- **GitGraphAdapter robustness**: Fail fast when `plumbing` is missing; include `stderr` in transient error detection; preserve empty-string config values; harden exit-code detection in `isAncestor` and `configGet`.
- **JoinReducer validation**: Enforce exactly 4 segments in `decodeEdgePropKey` (no silent truncation on malformed keys).
- **StateDiff edge visibility**: Filter edges by endpoint visibility — edges with tombstoned endpoints are now treated as invisible. Use precomputed node sets for O(1) lookups.
- **WarpGraph watch polling**: Add `pollInFlight` guard to prevent overlapping async poll cycles causing state mismatches.
- **WarpGraph subscriber notifications**: Skip notifying non-replay subscribers when diff is empty.
- **CborCodec**: Validate Map keys are strings; fix RFC 7049 doc to clarify we use JS lexicographic sort, not canonical CBOR.
- **SyncProtocol**: Use typed error code `E_SYNC_DIVERGENCE` for divergence detection instead of fragile string matching.
- **IndexRebuildService**: Enforce `rebuildRef` requirement when `autoRebuild` is true.
- **roaring.js**: Use Symbol sentinel to distinguish "not checked" from "indeterminate" availability.

### Refactoring

- **Centralized `canonicalStringify`**: New `src/domain/utils/canonicalStringify.js` shared by `BitmapIndexBuilder`, `BitmapIndexReader`, and `StreamingBitmapIndexBuilder` to prevent checksum algorithm drift.
- **Shared `SHARD_VERSION`**: Extracted to `src/domain/utils/shardVersion.js` to prevent version drift between `BitmapIndexBuilder` and `StreamingBitmapIndexBuilder`.
- **GitGraphAdapter `getExitCode`**: Extracted standalone helper function for consistent exit code extraction across `refExists`, `readRef`, `nodeExists`, and `_isConfigKeyNotFound`.
- **WarpGraph `watch()` pattern matching**: Pre-compile regex pattern once instead of on every `matchesPattern()` call for improved performance.
- **`canonicalStringify` JSON semantics**: Updated to match `JSON.stringify` behavior — top-level `undefined` returns `"null"`, array elements that are `undefined`/`function`/`symbol` become `"null"`, object properties with such values are omitted.

### Types

- **index.d.ts**: Added `LoadOptions` interface for `IndexRebuildService.load()` with `strict`, `currentFrontier`, `autoRebuild`, and `rebuildRef` options.
- **index.d.ts**: Added `configGet(key: string): Promise<string | null>` and `configSet(key: string, value: string): Promise<void>` to `GitGraphAdapter` class.

### Tests

- Bug fixes verified by existing test suite (2,094 tests pass).
- Additional coverage for edge visibility filtering, CborCodec validation, and watch polling guards.

## [7.7.0] — PULSE

### Added

#### PULSE — Subscriptions & Reactivity (v7.7.0)
- **State diff engine** (`PL/DIFF/1`): New `diffStates(before, after)` function computes deterministic diff between two `WarpStateV5` materialized states. Returns `{ nodes: { added, removed }, edges: { added, removed }, props: { set, removed } }`. Handles null `before` (initial state). O(N) single-pass comparison. Deterministic output ordering (sorted keys/IDs). Used by subscription system to notify handlers of graph changes. Includes `isEmptyDiff()` and `createEmptyDiff()` utilities.
- **Subscription API** (`PL/SUB/1`): New `graph.subscribe({ onChange, onError? })` returns `{ unsubscribe() }`. After `materialize()`, if state changed since last materialize, computes diff and calls `onChange(diff)` for all subscribers. Errors in handlers are isolated — caught and forwarded to `onError` if provided. Multiple subscribers supported. Unsubscribe stops future notifications.
- **Optional initial replay** (`PL/SUB/2`): New `replay` option for `graph.subscribe({ onChange, replay: true })`. When set, immediately fires `onChange` with a diff from empty state to current state. If cached state is not yet available (no prior `materialize()`), replay is deferred until the first `materialize()` call. Enables subscribers to bootstrap with current graph state without missing data.
- **Pattern-based watch** (`PL/WATCH/1`): New `graph.watch(pattern, { onChange, onError? })` returns `{ unsubscribe() }`. Like `subscribe()` but filters changes to only those matching the glob pattern. Filters apply to node IDs in `nodes.added`/`nodes.removed`, edge endpoints (`from`/`to`), and property `nodeId`. Uses same glob syntax as `query().match()` (e.g., `'user:*'`, `'order:123'`, `'*'`). Handler not called if all changes are filtered out. Reuses subscription infrastructure.
- **Polling integration** (`PL/WATCH/2`): New `poll` option for `graph.watch(pattern, { onChange, poll: 5000 })`. When set, periodically calls `hasFrontierChanged()` and auto-materializes if the frontier has changed (e.g., remote writes detected). Minimum poll interval is 1000ms. The interval is automatically cleaned up on `unsubscribe()`. Errors during polling are forwarded to `onError` if provided.

### Tests
- Added `test/unit/domain/services/StateDiff.test.js` (27 tests) — node/edge/prop diffs, null before, identical states, determinism
- Added `test/unit/domain/WarpGraph.subscribe.test.js` (28 tests) — subscribe/unsubscribe, onChange after materialize, error isolation, multiple subscribers, replay option
- Added `test/unit/domain/WarpGraph.watch.test.js` (41 tests) — pattern filtering for nodes/edges/props, glob patterns, unsubscribe, error handling, polling integration with frontier change detection

## [7.6.0] — LIGHTHOUSE

### Added

#### LIGHTHOUSE — Observability (v7.6.0)
- **`graph.status()` API** (`LH/STATUS/1`): New async method returns a lightweight operational health snapshot: `{ cachedState: 'fresh' | 'stale' | 'none', patchesSinceCheckpoint, tombstoneRatio, writers, frontier }`. O(writers) cost — does NOT trigger materialization. `cachedState` reflects dirty flag and frontier change detection.
- **Structured operation timing** (`LH/TIMING/1`): Core operations (`materialize()`, `syncWith()`, `createCheckpoint()`, `runGC()`) now emit structured timing logs via `LoggerPort` at info level. Format: `[warp] materialize completed in 142ms (23 patches)`. Uses injected `ClockPort` for testable timing. New `clock` option on `WarpGraph.open()` (defaults to `PerformanceClockAdapter`). Failed operations log timing with error context.
- **CLI status enhancement** (`LH/CLI/1`): `git warp check` now surfaces full `graph.status()` output. Human mode: color-coded staleness (green/yellow/red) with patch count, tombstone ratio, and writer count. JSON mode: raw `status` object included in check payload.
- **Tick receipt data structure** (`LH/RECEIPTS/1`): New `TickReceipt` immutable type: `{ patchSha, writer, lamport, ops: [{ op, target, result, reason? }] }`. Deep-frozen after creation. Canonical JSON serialization with deterministic key ordering. Exported from package root: `createTickReceipt`, `tickReceiptCanonicalJson`, `TICK_RECEIPT_OP_TYPES`, `TICK_RECEIPT_RESULT_TYPES`. TypeScript declarations added to `index.d.ts`.
- **Tick receipt emission during materialization** (`LH/RECEIPTS/2`): New `materialize({ receipts: true })` returns `{ state, receipts }` with per-patch decision records. Each receipt records per-op outcomes: `applied`, `superseded` (with LWW winner reason), or `redundant`. **Zero-cost invariant**: when `receipts` is false/omitted (default), strictly zero overhead — no arrays allocated, no strings constructed on the hot path. Return type unchanged (just `state`). OR-Set decisions: NodeAdd/EdgeAdd track new-dot vs re-add. NodeTombstone/EdgeTombstone track effective vs already-gone. PropSet decisions: LWW comparison with reason string showing winner info.

### Fixed
- **`status()` false staleness after eager commits**: `_lastFrontier` is now updated in all three `onCommitSuccess` callbacks and after `applySyncResponse()`, so `status()` correctly reports `'fresh'` instead of `'stale'` after local writes and sync operations.
- **Receipt forward-compatibility**: Unknown/future op types in the receipt-enabled materialization path are now silently skipped instead of throwing a validation error. The op is still applied to state; it just doesn't appear in the receipt.
- **Duplicate tombstone ratio in CLI**: `git warp check` no longer prints tombstone ratio twice when `graph.status()` is available.
- **`EmptyGraph` branding in WALKTHROUGH.md**: Replaced all remaining occurrences with `git-warp`/`Git Warp`.
- **`Empty Graph Container` in Dockerfile**: Updated to `Git Warp Container`.

### Tests
- Added `test/unit/domain/WarpGraph.status.test.js` (25 tests) — status() field correctness, no-materialize guarantee, frontier freshness after eager commits and sync
- Added `test/unit/domain/WarpGraph.timing.test.js` (15 tests) — timing logs for all 4 operations, clock injection
- Added `test/unit/domain/WarpGraph.receipts.test.js` (19 tests) — receipt emission, backward compatibility, zero-cost
- Added `test/unit/domain/types/TickReceipt.test.js` (44 tests) — construction, immutability, validation, canonical JSON
- Added `test/unit/domain/services/JoinReducer.receipts.test.js` (31 tests) — per-op outcome correctness, unknown op forward-compatibility
- Total new tests: 134. Suite total: 1998 tests across 91 files.

## [7.5.0] — COMPASS

### Added

#### COMPASS — Advanced Query Language (v7.5.0)
- **Object shorthand in `where()`** (`CP/WHERE/1`): `where({ role: 'admin' })` filters nodes by property equality. Multiple properties = AND semantics. Object and function forms can be mixed via chaining. Only primitive values (string, number, boolean, null) are accepted — non-primitive values (objects, arrays, functions) throw `E_QUERY_WHERE_VALUE_TYPE` since cloned property snapshots would never `===` match.
- **Multi-hop traversal** (`CP/MULTIHOP/1`): `outgoing(label, { depth: [1, 3] })` traverses 1–3 hops in a single call. `depth: 2` shorthand for exactly 2 hops. `depth: [0, N]` includes the start set (self-inclusion at depth 0). Default `[1, 1]` preserves existing single-hop behavior. Cycle-safe with deterministic ordering. Depth values must be non-negative integers with min ≤ max.
- **Aggregation** (`CP/AGG/1`): `aggregate({ count: true, sum: 'props.total' })` computes count/sum/avg/min/max over matched nodes without materializing the full result set. Terminal operation — calling `select()`, `outgoing()`, or `incoming()` after `aggregate()` throws. Non-numeric values silently skipped. Spec fields are validated: `sum`/`avg`/`min`/`max` must be strings, `count` must be boolean.

### Fixed
- **`aggregate()` spec validation**: Passing non-string paths (e.g. `sum: true`) or non-boolean count (e.g. `count: 'yes'`) now throws `QueryError` with code `E_QUERY_AGGREGATE_TYPE` instead of a late `TypeError`.
- **`Math.min/max` stack overflow**: Replaced `Math.min(...values)` / `Math.max(...values)` in aggregation with `.reduce()` to avoid `RangeError` on arrays with >65K elements.
- **`normalizeDepth` validation**: Negative, non-integer, and min>max depth values now throw `QueryError` (`E_QUERY_DEPTH_TYPE` or `E_QUERY_DEPTH_RANGE`) instead of producing undefined behavior.
- **`applyMultiHop` depth-0 inclusion**: `depth: [0, N]` now correctly includes the start set in results. Previously, nodes at hop 0 were silently dropped.
- **`where()` primitive enforcement**: Object shorthand values are validated as primitives. Non-primitive values (objects, arrays, functions) throw `QueryError` with code `E_QUERY_WHERE_VALUE_TYPE`.
- **ROADMAP.md fenced code block**: Added `text` language identifier to the Task DAG code fence (fixes markdownlint MD040).

## [7.0.0]

### Added
- **git-warp CLI** - canonical `git warp` entrypoint (shim + PATH install)
- **Installer scripts** - `scripts/install-git-warp.sh` and `scripts/uninstall-git-warp.sh`
- **Docker bats CLI test** coverage for `git warp` commands
- **Pre-push hook** - runs lint, unit tests, benchmarks, and Docker bats CLI suite
- **`graph.serve()`** - one-line HTTP sync transport for multi-writer graphs
- **`graph.syncWith()`** - sync with HTTP peer or direct graph instance
- **`graph.getWriterPatches(writerId)`** - public API for writer patch history

#### AUTOPILOT — Kill the Materialize Tax
- **Auto-invalidation** (`AP/INVAL/1-3`): `_stateDirty` flag tracks staleness. Local commits via `createPatch()`, `writer.commitPatch()`, and `PatchSession.commit()` eagerly apply patches to cached state — no stale reads after writes.
- **Auto-materialize** (`AP/LAZY/1-2`): `autoMaterialize: boolean` option on `WarpGraph.open()`. When enabled, query methods (`hasNode`, `getNodeProps`, `neighbors`, `getNodes`, `getEdges`, `query().run()`, `traverse.*`) auto-materialize instead of throwing.
- **Auto-checkpointing** (`AP/CKPT/1-3`): `checkpointPolicy: { every: N }` option on `WarpGraph.open()`. After `materialize()` processes N+ patches, a checkpoint is created automatically. Failures are swallowed — never breaks materialize.
- **Post-merge hook** (`AP/HOOK/1-2`): `post-merge` Git hook detects warp ref changes after `git pull` and prints a warning (or auto-materializes if `warp.autoMaterialize` git config is set). Installed via `scripts/hooks/` on `npm install`.
- **`git warp materialize`** CLI command: materializes and checkpoints all graphs (or a single graph with `--graph`).
- **`git warp install-hooks`** CLI command: installs/upgrades the post-merge hook with interactive conflict resolution.
- **ROADMAP.md** with task DAG and `scripts/roadmap.js` tracking tool.

#### Error Handling
- **`QueryError` with error codes**: State guard throws now use `QueryError` with `E_NO_STATE` (no cached state) and `E_STALE_STATE` (dirty state) instead of bare `Error`.

#### GROUNDSKEEPER — Index Health & GC
- **Index staleness detection** (`GK/IDX/1-2`): Frontier metadata stored alongside bitmap indexes. `loadIndexFrontier()` and `checkStaleness()` detect when writer tips have advanced past the indexed state. Auto-rebuild option on `IndexRebuildService.load()`.
- **Tombstone garbage collection** (`GK/GC/1`): `GCPolicy` wired into post-materialize path (opt-in via `gcPolicy` option). Warns when tombstone ratio exceeds threshold.

#### WEIGHTED — Edge Properties (v7.3.0)
- **Edge property key encoding** (`WT/EPKEY/1`): `encodeEdgePropKey()`/`decodeEdgePropKey()` with `\x01` prefix for collision-free namespacing against node property keys.
- **`patch.setEdgeProperty(from, to, label, key, value)`** (`WT/OPS/1`): New PatchBuilderV2 method for setting properties on edges. Generates `PropSet` ops in the edge namespace.
- **LWW semantics for edge properties** (`WT/OPS/2`): Existing JoinReducer LWW pipeline handles edge properties transparently — no special-case logic needed.
- **`graph.getEdgeProps(from, to, label)`** (`WT/OPS/3`): New convenience method returning edge properties as a plain object. `getEdges()` now returns a `props` field on each edge.
- **Schema v3** (`WT/SCHEMA/1`): Minimal schema bump signaling edge property support. `detectSchemaVersion()` auto-detects from ops. Codec handles v2 and v3 transparently.
- **Mixed-version sync safety** (`WT/SCHEMA/2`): `assertOpsCompatible()` guard throws `E_SCHEMA_UNSUPPORTED` when v2 reader encounters edge property ops. Node-only v3 patches accepted by v2 readers. Fail fast, never silently drop data.
- **Edge property visibility gating** (`WT/VIS/1`): Edge props invisible when parent edge is tombstoned. Birth-lamport tracking ensures re-adding an edge starts with a clean slate (old props not restored).
- **`SchemaUnsupportedError`** — New error class with code `E_SCHEMA_UNSUPPORTED` for sync compatibility failures.

#### HANDSHAKE — Multi-Writer Ergonomics (v7.4.0)
- **Two-form writer API** (`HS/WRITER/1`): `graph.writer()` returns stable identity writer (resolved from git config or generated); `graph.writer(id)` returns explicit-identity writer. `createWriter()` deprecated with console warning.
- **Sync-then-materialize** (`HS/SYNC/1`): `syncWith(peer, { materialize: true })` atomically syncs and materializes, returning `{ applied, attempts, state }`.
- **Error audit** (`HS/ERR/1`): Classified all 93 throw sites across the codebase (documented in `docs/error-audit.md`).
- **Error codes with recovery hints** (`HS/ERR/2`): `E_NO_STATE` and `E_STALE_STATE` messages now include actionable recovery guidance (call `materialize()` or enable `autoMaterialize`).
- **CAS failure detection** (`HS/CAS/1`): `PatchBuilderV2.commit()` throws `WriterError` with code `WRITER_CAS_CONFLICT` and `expectedSha`/`actualSha` properties on compare-and-swap mismatch.
- **Delete guard option** (`HS/DELGUARD/1`): `onDeleteWithData: 'reject' | 'cascade' | 'warn'` option on `WarpGraph.open()` (default `'warn'`).
- **Reject and warn modes** (`HS/DELGUARD/2`): `removeNode()` throws on nodes with attached data in reject mode; logs `console.warn` in warn mode.
- **Cascade deletion** (`HS/DELGUARD/3`): Cascade mode auto-generates `EdgeRemove` ops for all connected edges before `NodeRemove`. Generated ops appear in the committed patch for auditability.

#### Query API (V7 Task 7)
- **`graph.hasNode(nodeId)`** - Check if node exists in materialized state
- **`graph.getNodeProps(nodeId)`** - Get all properties for a node as Map
- **`graph.neighbors(nodeId, dir?, label?)`** - Get neighbors with direction/label filtering
- **`graph.getNodes()`** - Get all visible node IDs
- **`graph.getEdges()`** - Get all visible edges as `{from, to, label}` array

All query methods operate on `WarpStateV5` (materialized state), never commit DAG topology.

#### WARP State Index (V7 Task 6)
- **`WarpStateIndexBuilder`** - New index builder that indexes WARP logical edges from `edgeAlive` OR-Set
- **`buildWarpStateIndex(state)`** - Convenience function to build and serialize index from state
- Index built from materialized state, not Git commit parents (TECH-SPEC-V7.md compliance)

### Changed
- **ESLint hardened** to zero-tolerance: `typescript-eslint` strict type-checked rules on `src/` and `bin/`, max-complexity 10, max-lines-per-function 50, max-depth 3 (with relaxations for algorithm-heavy modules).
- **`_ensureFreshState()`** now throws `E_STALE_STATE` when cached state is dirty and `autoMaterialize` is off (previously silently returned stale data).
- **`QueryBuilder.run()`** `where`/`select` loops parallelized with `Promise.all`.
- **`StreamingBitmapIndexBuilder.registerNode()`** returns `Promise<number>` via `Promise.resolve()` for API compatibility.
- **`createCheckpoint()`** reuses cached state when fresh, guarded against recursive auto-checkpoint calls.
- **`execGitConfigValue`** in CLI uses `execFileSync` with argument array instead of shell string (prevents command injection).
- **`eslint.config.js`** uses `fileURLToPath`-based `__dirname` for broader Node.js compatibility.
- **Repo ping** now uses `git rev-parse --is-inside-work-tree` for plumbing compatibility
- **CLI imports** avoid eager `index.js` loading to suppress `url.parse` warnings from optional deps
- **v7-guards.test.js** - Added `WarpStateIndexBuilder.js` to required V7 components
- **Benchmarks** now run in non-watch mode for CI/pre-push safety
- **Docker test image** copies hooks/patches before `npm install` to support postinstall
- **Git ref reads** guard missing refs to avoid fatal `show-ref` errors in empty repos

### Documentation
- **Complete JSDoc coverage** across 21 source files
- **ROADMAP.md** — consolidated task tracking with dependency DAG
- **`docs/V7_TEST_MAPPING.md`** - Maps TECH-SPEC-V7.md Task 5 requirements to existing test files
  - Documents how existing tests cover WARP contracts (write, materialize, convergence, determinism)
  - Confirms legacy tests deleted (not skipped)
  - Provides verification commands
- Hook docs updated in README/CONTRIBUTING
- Example imports clarified for external consumers

### Tests
- Added `test/unit/domain/WarpGraph.invalidation.test.js` (11 tests) — dirty flag + eager re-materialize
- Added `test/unit/domain/WarpGraph.writerInvalidation.test.js` (10 tests) — Writer API invalidation
- Added `test/unit/domain/WarpGraph.lazyMaterialize.test.js` (46 tests) — auto-materialize guard
- Added `test/unit/domain/WarpGraph.autoCheckpoint.test.js` (14 tests) — auto-checkpoint trigger
- Added `test/unit/domain/WarpGraph.autoMaterialize.test.js` (7 tests) — option validation
- Added `test/unit/domain/WarpGraph.checkpointPolicy.test.js` (9 tests) — option validation
- Added `test/unit/domain/WarpGraph.patchCount.test.js` (7 tests) — patch counter tracking
- Added `test/unit/domain/services/HookInstaller.test.js` (29 tests) — hook install/upgrade/append/replace
- Added `test/unit/domain/WarpGraph.query.test.js` (21 tests) - Query API tests
- Added `test/unit/domain/services/WarpStateIndexBuilder.test.js` (13 tests) - WARP state index tests
- Added `test/unit/domain/WarpGraph.writerApi.test.js` (5 tests) — writer() two-form API
- Added `test/unit/domain/WarpGraph.syncMaterialize.test.js` (3 tests) — syncWith materialize option
- Added `test/unit/domain/WarpGraph.errorCodes.test.js` (27 tests) — E_NO_STATE/E_STALE_STATE codes and hints
- Added `test/unit/domain/services/PatchBuilderV2.cas.test.js` (7 tests) — CAS conflict detection
- Added `test/unit/domain/WarpGraph.deleteGuard.test.js` (6 tests) — onDeleteWithData option validation
- Added `test/unit/domain/WarpGraph.deleteGuardEnforce.test.js` (13 tests) — reject/warn/cascade enforcement
- Added `test/unit/domain/WarpGraph.cascadeDelete.test.js` (8 tests) — cascade deletion with edge cleanup
- Total test count: 1833 (85 test files)

## [6.0.0] - 2026-01-31

### Breaking Changes

#### WARP Unification Complete
- **`WarpGraph` is now the recommended API** for all new projects
- **`EmptyGraph` is now a wrapper** - Implementation moved to `EmptyGraphWrapper.js`, maintains full API compatibility
- **Schema:2 is now the default** for `WarpGraph.open()` and `openMultiWriter()`
- **Legacy EmptyGraph engine removed** - Old implementation frozen in wrapper for compatibility

### Added

#### WARP v5 (OR-Set CRDT)
- **OR-Set CRDTs** - `Dot`, `VersionVector`, `ORSet` for add-wins semantics
- **`JoinReducer`** - CRDT join operation with schema:2 support
- **`PatchBuilderV2`** - Schema:2 patch builder with dot tracking
- **`CheckpointSerializerV5`** - V5 checkpoint format with OR-Set state
- **`SyncProtocol`** - Network sync request/response with frontier comparison
- **`GCPolicy` & `GCMetrics`** - Tombstone garbage collection
- **Backfill rejection** - Graph reachability validation against checkpoint frontier

#### Migration Support
- **`migrateV4toV5()`** - Exported from package root for schema migration
- **Migration boundary validation** - Prevents opening schema:2 with unmigrated v1 history

#### API Status Documentation
- **README API Status section** - Clear guidance on recommended vs deprecated APIs
- **Migration examples** - Code samples for EmptyGraph → WarpGraph migration

### Changed
- `WarpGraph.open()` now defaults to `schema: 2`
- `EmptyGraph.openMultiWriter()` explicitly passes `schema: 2`
- `EmptyGraph` constructor shows deprecation warning (once per process)

### Removed
- `src/legacy/EmptyGraphLegacy.js` - Legacy engine code removed (wrapper preserves API)

## [4.0.0] - 2026-01-31

### Added

#### Multi-Writer Support (WARP Protocol v4)
- **`EmptyGraph.openMultiWriter()`** - New static factory for creating multi-writer graphs with deterministic convergence
- **`WarpGraph`** - Main API class for WARP multi-writer graph operations
- **`PatchBuilder`** - Fluent API for constructing graph mutations as atomic patches
  - `.addNode(nodeId)` - Add a node
  - `.removeNode(nodeId)` - Tombstone a node
  - `.addEdge(from, to, label)` - Add an edge
  - `.removeEdge(from, to, label)` - Tombstone an edge
  - `.setProperty(nodeId, key, value)` - Set a property
  - `.commit()` - Commit the patch atomically

#### State Materialization
- **`graph.materialize()`** - Reduces all patches from all writers to current state
- **`graph.materializeAt(checkpointSha)`** - Incremental materialization from checkpoint
- **`graph.discoverWriters()`** - List all writers who have contributed to the graph

#### Checkpoints
- **`CheckpointService`** - Create, load, and incrementally rebuild from checkpoints
- **`graph.createCheckpoint()`** - Snapshot current state for fast recovery
- Checkpoint format: `state.cbor`, `frontier.cbor` in Git tree

#### Coverage & Sync
- **`graph.syncCoverage()`** - Create octopus anchor ensuring all writers reachable from single ref

#### CRDT Foundation
- **`LWW` (Last-Writer-Wins)** - Register type for conflict resolution
- **`EventId`** - Total ordering tuple `(lamport, writerId, patchSha, opIndex)`
- **`Reducer`** - Deterministic fold algorithm with LWW semantics
- **`Frontier`** - Writer progress tracking `Map<writerId, lastPatchSha>`
- **`StateSerializer`** - Canonical state hashing for determinism verification

#### Infrastructure
- **`WarpMessageCodec`** - Encode/decode patch, checkpoint, and anchor commit messages with Git trailers
- **`CborCodec`** - Canonical CBOR encoding for deterministic serialization
- **`RefLayout`** - Ref path builders and validators for WARP ref structure
- **`LegacyAnchorDetector`** - Backward compatibility for v3 JSON anchors

#### GitGraphAdapter Extensions
- **`commitNodeWithTree()`** - Create commits pointing to custom trees (for patch attachments)
- **`listRefs(prefix)`** - List refs under a prefix (for writer discovery)

### Performance
- 10K patches reduce in ~100ms (50x faster than 5s requirement)
- Memory usage ~35MB for 10K patches (well under 500MB limit)
- Incremental materialization from checkpoints for O(new patches) recovery

### Documentation
- Added "Multi-Writer API (WARP v4)" section to README
- Created `docs/MULTI-WRITER-GUIDE.md` - Comprehensive user guide
- Created `docs/WARP-TECH-SPEC-ROADMAP.md` - Full protocol specification
- Created `docs/WARP-V5-HANDOFF.md` - Handoff notes for v5 implementation

### Testing
- Determinism tests: verify `reduce([A,B]) === reduce([B,A])`
- Tombstone stability tests: concurrent add/tombstone/property scenarios
- Performance benchmarks: 1K, 5K, 10K, 25K patch scaling
- v3 backward compatibility tests: legacy anchor detection
- Integration tests: real Git operations with multiple writers

## [3.0.0] - 2025-01-30

### Added

#### Managed Mode & Durability
- **`EmptyGraph.open()`** - New static factory for creating managed graphs with automatic durability guarantees
- **Anchor commits** - Automatic creation of anchor commits to prevent GC of disconnected subgraphs
- **`graph.sync(sha)`** - Manual ref synchronization for `autoSync: 'manual'` mode
- **`graph.anchor(ref, shas)`** - Power user method for explicit anchor creation

#### Batching API
- **`graph.beginBatch()`** - Start a batch for efficient bulk writes
- **`GraphBatch.createNode()`** - Create nodes without per-write ref updates
- **`GraphBatch.commit()`** - Single octopus anchor for all batch nodes
- **`graph.compactAnchors()`** - Utility to compact anchor chains into single octopus

#### Validation & Error Handling
- **`EmptyMessageError`** - New error type for empty message validation (code: `EMPTY_MESSAGE`)
- Empty messages now rejected at write time (prevents "ghost nodes")

#### Index Improvements
- **Canonical JSON checksums** - Deterministic checksums for cross-engine compatibility
- **Shard version 2** - New format with backward compatibility for v1
- **`SUPPORTED_SHARD_VERSIONS`** - Reader accepts both v1 and v2 shards

#### Performance
- **`isAncestor()`** - New method on GitGraphAdapter for ancestry checking
- **Fast-forward detection** - `syncHead()` skips anchor creation for linear history
- **Octopus anchoring** - Batch.commit() creates single anchor with N parents

#### Cancellation
- AbortSignal propagation added to all TraversalService methods
- AbortSignal support in StreamingBitmapIndexBuilder finalization

#### Node Query API
- **`getNode(sha)`** - Returns full GraphNode with all metadata (sha, author, date, message, parents)
- **`hasNode(sha)`** - Boolean existence check without loading full node data
- **`countNodes(ref)`** - Count nodes reachable from a ref without loading all nodes into memory

#### Batch Operations
- **`createNodes(nodes)`** - Create multiple nodes in a single operation with placeholder parent refs

#### Caching & Resilience
- **LRU Cache** - Loaded shards now use an LRU cache to bound memory usage
- **Retry Logic** - `GitGraphAdapter` now retries transient Git failures with exponential backoff and decorrelated jitter
  - Uses `@git-stunts/alfred` resilience library
  - Retries on: "cannot lock ref", "resource temporarily unavailable", "connection timed out"
  - Configurable via `retryOptions` constructor parameter
- **CachedValue Utility** - Reusable TTL-based caching utility in `src/domain/utils/CachedValue.js`
- **Memory Warning** - `BitmapIndexReader` logs a warning when ID-to-SHA cache exceeds 1M entries (~40MB)

### Changed
- `SHARD_VERSION` bumped from 1 to 2 (v1 still readable)
- **TraversalService** - Refactored path reconstruction into unified `_walkPredecessors()` and `_walkSuccessors()` helpers
- **HealthCheckService** - Now uses `CachedValue` utility instead of inline caching logic

### Fixed
- **Durability bug** - Nodes created via `createNode()` were not reachable from any ref, making them vulnerable to Git GC
- **Ghost nodes** - Empty messages allowed at write time but rejected during iteration

### Documentation
- Added `SEMANTICS.md` - Durability contract and anchor commit semantics
- Updated `README.md` - Durability warning, mode selection guide, new API docs
- Added **Memory Considerations** section documenting memory requirements for large graphs

## [2.5.0] - 2026-01-29

### Added
- **Git Hooks**: Custom pre-commit hook runs ESLint on staged files (`npm run setup:hooks` to enable)
- **Cancellation Support**: Abort long-running operations with `AbortSignal`
  - `checkAborted(signal, operation)` - Throws `OperationAbortedError` if aborted
  - `createTimeoutSignal(ms)` - Creates auto-aborting signal for timeouts
  - Added `signal` parameter to `iterateNodes()` and `rebuildIndex()`
  - Demo scripts now use 60-second timeout to prevent indefinite hangs
- **Dijkstra's Algorithm**: `weightedShortestPath()` with custom weight provider
  - Supports async weight functions for Lagrangian cost calculations
  - Returns `{ path, totalCost }`
- **A* Search**: `aStarSearch()` with heuristic guidance
  - Supports both `weightProvider` and `heuristicProvider` callbacks
  - Tie-breaking favors higher g(n) for efficiency
  - Returns `{ path, totalCost, nodesExplored }`
- **Bidirectional A***: `bidirectionalAStar()` - meets in the middle from both ends
  - Separate forward/backward heuristics
  - Optimal path finding with potentially fewer explored nodes
- **MinHeap Utility**: `src/domain/utils/MinHeap.js` for priority queue operations
  - Methods: `insert()`, `extractMin()`, `peekPriority()`, `isEmpty()`, `size()`
- **Lagrangian Demo**: `npm run demo:lagrangian` - Resource-aware pathfinding
  - Event payloads now include `metrics: { cpu, mem }` for weight calculations
  - Demonstrates Dijkstra, A*, and cost optimization concepts
- **Streaming Benchmark**: `npm run demo:bench-streaming` - Memory profile for 100K+ nodes
  - Verifies constant memory overhead during iteration (~7% variance)
  - Measures stream throughput (~24K nodes/sec)
- **Traversal Benchmark**: `npm run demo:bench-traversal` - Weighted pathfinding at scale
  - Tests Dijkstra, A*, Bidirectional A* on linear and diamond graphs (100-5000 nodes)
  - Compares algorithm performance characteristics
- **OperationAbortedError**: New error class for cancellation scenarios

### Changed
- **Cancellation**: `createTimeoutSignal()` now uses native `AbortSignal.timeout()` for cleaner implementation
- **BitmapIndexReader**: Non-strict mode now caches empty shards on validation/parse failures to avoid repeated I/O
- **BitmapIndexReader**: Refactored for reduced complexity with extracted helper methods (`_validateShard`, `_parseAndValidateShard`, `_loadShardBuffer`, `_getEdges`)
- **StreamingBitmapIndexBuilder**: Parallel shard writes using `Promise.all` for improved performance during flush and finalize operations
- **TraversalService**: `findPath()` now accepts `maxNodes` parameter for consistency with `bfs`/`dfs`
- **index.js**: `loadIndex()` now resets cached `_traversal` so subsequent access uses the new index
- **Async Weight Providers**: `weightProvider` callbacks now properly awaited in all algorithms
  - Fixes bug where async weight functions returned Promises instead of numbers
- **README**: Reorganized sections for better flow - moved Use Cases up, improved navigation

### Fixed
- **Constructor Validation**: All services now fail fast with clear error messages when required dependencies are missing
  - `BitmapIndexReader` requires `storage`
  - `IndexRebuildService` requires `graphService` and `storage`
  - `StreamingBitmapIndexBuilder` requires positive `maxMemoryBytes`
  - `GraphService` requires `persistence`, positive `maxMessageBytes`, and string `message`
  - `TraversalService` requires `indexReader`
- **Examples**: Improved robustness across demo scripts
  - `lagrangian-path.js`: handles empty graphs and malformed JSON gracefully
  - `explore.js`: guards against empty events, removes unused import, adds curly braces, adds eslint overrides, wraps all JSON.parse calls
  - `setup.js`: clears timeout to allow immediate process exit
  - `streaming-benchmark.js`: handles divide-by-zero and -Infinity edge cases when no heap samples
  - `traversal-benchmark.js`: catches JSON parse errors in weight provider, refactored deep nesting
  - `inspect-index.js`: renamed misleading `totalEdges` to `totalEdgeLists`
  - `event-sourcing.js`: removed unused eslint-disable directives
- **ESLint Code Style**: Comprehensive cleanup across all example scripts
  - Added curly braces to all single-line if/else blocks
  - Converted string concatenation to template literals
  - Split multi-variable declarations (one-var rule)
  - Refactored deeply nested blocks to reduce max-depth violations
  - Converted 4-parameter functions to options objects (max-params rule)
  - Removed unused variables and redundant eslint-disable directives
- **Error Classes**: Removed redundant `Error.captureStackTrace` calls in `ShardValidationError` and `ShardCorruptionError`
- **GitLogParser**: Removed `trim()` from final record to preserve message content exactly
- **BitmapIndexReader**: `_validateShard` now guards against missing/invalid `envelope.data` before computing checksum
- **StreamingBitmapIndexBuilder**: `_mergeChunks` wraps JSON parse, bitmap deserialize, and serialization errors in `ShardCorruptionError`
- **Cancellation**: `checkAborted` now passes `'unknown'` as fallback when operation is undefined
- **TraversalService**: Path reconstruction methods now guard against undefined predecessors to prevent infinite loops
- **TraversalService**: `_reconstructBidirectionalPath` guards fixed to check `undefined` instead of `null`
- **Tests**: Improved test stability and resilience
  - NoOpLogger performance test uses generous threshold for CI environments
  - BitmapIndexBuilder tests use hex-like SHAs for realism
  - Streaming index tests store raw buffers and use resilient assertions
  - GraphService test uses idiomatic `expect().rejects.toThrow()` pattern
  - StreamingBitmapIndexBuilder test mock uses SHA-256 checksums matching production
  - logging.integration test properly invokes async IIFE for `.rejects` matcher
  - Weight provider not awaited in `weightedShortestPath`, `aStarSearch`, and `bidirectionalAStar`

### Docs
- README: Added `text` language specifier to output code blocks
- TASKLIST: Fixed table formatting and grammar
- ARCHITECTURE: Fixed table separator spacing, renamed CacheRebuildService to IndexRebuildService
- WALKTHROUGH: Added language specifiers, converted bold to headings, fixed deleted demo-adapter.js reference
- **TypeScript**: Comprehensive type declaration updates
  - Added `OperationAbortedError`, `IndexError`, `ShardLoadError`, `ShardCorruptionError`, `ShardValidationError`, `StorageError` classes
  - Added `checkAborted` and `createTimeoutSignal` function declarations
  - Added `signal` parameter to `IterateNodesOptions` and `RebuildOptions`
  - Added `maxMemoryBytes`, `onFlush`, `onProgress` to `RebuildOptions`
  - Added `maxNodes` to `PathOptions`
  - Added `weightedShortestPath`, `aStarSearch`, `bidirectionalAStar` method declarations
  - Added `throwOnCycle` to `TopologicalSortOptions`

## [2.4.0] - 2026-01-29

### Added
- **Interactive Docker Demo**: Production-ready demo using real `GitGraphAdapter` with plumbing
  - `npm run demo:setup` - Creates container with sample e-commerce event graph (idempotent)
  - `npm run demo` - Drops into container shell for exploration
  - `npm run demo:explore` - Runs interactive graph explorer demonstrating traversal, projections, and path finding
  - `npm run demo:inspect` - Visualizes sharded bitmap index with ASCII distribution charts
- **Idempotent Demo Setup**: `setup.js` now detects existing demo data and cleans up before re-running
- **Performance Telemetry**: `explore.js` includes high-resolution timing comparing O(1) bitmap lookups vs git log (with speedup factors)
- **Index Inspector**: New `inspect-index.js` script pretty-prints shard distribution, node counts, and memory estimates

### Changed
- **Plumbing Upgrade**: Upgraded `@git-stunts/plumbing` from `^2.7.0` to `^2.8.0`
  - Version 2.8.0 adds `log` and `show` to the command whitelist
- **NUL Byte Handling**: `GitGraphAdapter.logNodesStream()` now strips NUL bytes from format strings
  - The `-z` flag handles NUL termination automatically
  - Node.js `child_process` rejects args containing null bytes

### Removed
- **Demo Adapter Hack**: Deleted `examples/demo-adapter.js` bypass adapter
  - Demo scripts now use production `GitGraphAdapter` directly

### Fixed
- **Demo Scripts**: `examples/setup.js` and `examples/explore.js` now use proper plumbing integration

## [2.3.0] - 2026-01-18

### Added
- **OID Validation**: New `_validateOid()` method in `GitGraphAdapter` validates all Git object IDs before use
- **DEFAULT_INDEX_REF Export**: The default index ref constant is now exported for TypeScript consumers
- **Benchmark Environment Notes**: Added reproducibility information to THE_STUNT.md

### Changed
- **Configurable Rebuild Limit**: `CacheRebuildService.rebuild()` now accepts an optional `{ limit }` parameter (default: 10M)
- **Docker Compose v2**: CI workflow updated to use `docker compose` (space-separated) instead of legacy `docker-compose`
- **Robust Parent Parsing**: Added `.filter(Boolean)` to handle empty parent lines from root commits
- **UTF-8 Streaming**: `TextDecoder` now uses `{ stream: true }` option to correctly handle multibyte characters split across chunks

### Security
- **OID Injection Prevention**: All OIDs validated against `/^[0-9a-fA-F]{4,64}$/` pattern
- **OID Length Limits**: OIDs cannot exceed 64 characters
- **Format Parameter Guard**: `logNodes`/`logNodesStream` now conditionally add `--format` flag to prevent `--format=undefined`

### Fixed
- **UTF-8 Chunk Boundaries**: Commit messages with multibyte UTF-8 characters no longer corrupted when split across stream chunks
- **Empty Parent Arrays**: Root commits now correctly return `[]` instead of `['']` for parents

### Tests
- **Stronger Assertions**: `CacheRebuildService.test.js` now verifies `writeBlob` call count
- **End-to-End Coverage**: Enabled `getParents`/`getChildren` assertions in integration tests
- **Public API Usage**: Benchmarks now use public `registerNode()` instead of private `_getOrCreateId()`

## [2.2.0] - 2026-01-08

### Added
- **Comprehensive Audit Fixes**: Completed three-phase audit (DX, Production Readiness, Documentation)
- **iterateNodes to Facade**: Added `iterateNodes()` async generator method to EmptyGraph facade for first-class streaming support
- **JSDoc Examples**: Added @example tags to all facade methods (createNode, readNode, listNodes, iterateNodes, rebuildIndex)
- **Input Validation**: GraphNode constructor now validates sha, message, and parents parameters
- **Limit Validation**: iterateNodes validates limit parameter (1 to 10,000,000) to prevent DoS attacks
- **Graceful Degradation**: BitmapIndexService._getOrLoadShard now handles corrupt/missing shards gracefully with try-catch
- **RECORD_SEPARATOR Constant**: Documented magic string '\x1E' with Wikipedia link explaining delimiter choice
- **Error Handling Guide**: Added comprehensive Error Handling section to README with common errors and solutions
- **"Choosing the Right Method" Guide**: Added decision table for listNodes vs iterateNodes vs readNode

### Changed
- **API Consistency**: Standardized readNode signature from `readNode({ sha })` to `readNode(sha)` for consistency
- **Ref Validation**: Added 1024-character length limit to prevent buffer overflow attacks
- **Error Messages**: Enhanced error messages with documentation links (#ref-validation, #security)
- **Code Quality**: Refactored GitGraphAdapter.commitNode to use declarative array construction (flatMap, spread)
- **README Examples**: Fixed all code examples to match actual API signatures (readNode, await keywords)

### Security
- **Length Validation**: Refs cannot exceed 1024 characters
- **DoS Prevention**: iterateNodes limit capped at 10 million nodes
- **Input Validation**: GraphNode constructor enforces type checking on all parameters
- **Better Error Context**: Validation errors now include links to documentation

### Documentation
- **JSDoc Complete**: All facade methods now have @param, @returns, @throws, and @example tags
- **README Accuracy**: All code examples verified against actual implementation
- **Error Scenarios**: Documented common error patterns with solutions
- **Usage Guidance**: Added decision tree for choosing appropriate methods

### Technical Debt Reduced
- Eliminated magic string (RECORD_SEPARATOR now a documented constant)
- Improved code readability with declarative programming (flatMap vs forEach)
- Enhanced robustness with graceful degradation patterns

### Audit Results
- **DX Score**: 8/10 → 9/10 (API consistency improved)
- **IQ Score**: 9/10 → 9.5/10 (code quality improvements)
- **Combined Health Score**: 8.5/10 → 9.5/10
- **Ship Readiness**: YES - All critical and high-priority issues resolved

## [2.1.0] - 2026-01-08

### Added
- **Ref Validation**: Added `_validateRef()` method in `GitGraphAdapter` to prevent command injection attacks
- **Production Files**: Added LICENSE, NOTICE, SECURITY.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md
- **CI Pipeline**: GitHub Actions workflow for linting and testing
- **Enhanced README**: Comprehensive API documentation, validation rules, performance characteristics, and architecture diagrams
- **npm Metadata**: Full repository URLs, keywords, engines specification, and files array

### Changed
- **Dependency Management**: Switched from `file:../plumbing` to npm version `@git-stunts/plumbing: ^2.7.0`
- **Description**: Enhanced package description with feature highlights
- **Delimiter**: Confirmed use of ASCII Record Separator (`\x1E`) for robust parsing

### Security
- **Ref Pattern Validation**: All refs validated against `/^[a-zA-Z0-9_/-]+(\^|\~|\.\.|\.)*$/`
- **Injection Prevention**: Refs cannot start with `-` or `--` to prevent option injection
- **Command Whitelisting**: Only safe Git plumbing commands permitted through adapter layer

## [2.0.0] - 2026-01-07

### Added
- **Roaring Bitmap Indexing**: Implemented a sharded index architecture inspired by `git-mind` for O(1) graph lookups.
- **CacheRebuildService**: New service to scan Git history and build/persist the bitmap index as a Git Tree.
- **Streaming Log Parser**: Refactored `listNodes` to use async generators (`iterateNodes`), supporting graphs with millions of nodes without OOM.
- **Docker-Only Safety**: Integrated `pretest` guards to prevent accidental host execution.
- **Performance Benchmarks**: Added a comprehensive benchmark suite and D3.js visualization.

### Changed
- **Hexagonal Architecture**: Full refactor into domain entities and infrastructure adapters.
- **Local Linking**: Switched to `file:../plumbing` for explicit local-first development.
- **Delimiter Hardening**: Moved to a Null Byte separator for robust `git log` parsing.

## [1.0.0] - 2025-10-15

### Added
- Initial release with basic "Empty Tree" commit support.
