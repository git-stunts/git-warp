# ROADMAP — @git-stunts/git-warp

> **Current version:** v14.0.0
> **Last reconciled:** 2026-03-04 (priority triage: 45 standalone items sorted into P0–P6 tiers, wave-based execution order, dependency chains mapped)
> **Completed milestones:** [docs/ROADMAP/COMPLETED.md](docs/ROADMAP/COMPLETED.md)

---

## Quality Bar (Mandatory)

- branch coverage threshold (not vanity 100%)
- mutation testing for verifier-critical logic
- invariant/property tests for chain semantics
- chaos tests for delayed commits / racey interleavings where applicable
- CI matrix across supported Node + Git versions

---

## Milestone 10 — SENTINEL (remaining)

**Theme:** Trust hardening + sync safety + correctness
**Triage date:** 2026-02-17

> T1–T3 completed — see [COMPLETED.md](docs/ROADMAP/COMPLETED.md#milestone-10--sentinel-completed-tasks).

### M10.T4 — Causality Bisect Spec

- **Status:** `DONE` (spec existed; implementation completed in M11)

**Items:**

- **B2 (spec only)** ✅ (CAUSALITY BISECT) — Spec committed at `docs/specs/BISECT_V1.md`. Full implementation shipped in M11/v13.0.0.

**M10 Gate:** Signed ingress enforced end-to-end; trust E2E receipts green; B63 GC isolation verified under concurrent writes; B64 sync payload validation green; B65 divergence logging verified; B2 spec committed with test vectors.

---

## Milestone 13 — SCALPEL II (remaining)

**Theme:** Edge property encoding — internal canonicalization + governed wire-format migration
**Triage date:** 2026-02-28

> T1–T2 completed — see [COMPLETED.md](docs/ROADMAP/COMPLETED.md#milestone-13--scalpel-ii-completed-tasks).

### M13.T3 — Persisted Wire-Format Migration (ADR 2)

- **Status:** `DEFERRED` — governed by ADR 3 readiness gates
- **Size:** XL | **Risk:** HIGH
- **Depends on:** ADR 3 Gate 1 satisfaction

**Remaining B116 scope:**

- **B116** (S2: EXPLICIT EDGEPROPSET OP — wire-format half) — Promote `EdgePropSet` to persisted raw op type (schema version 4). Graph capability ratchet. Mixed v3+v4 materialization. Read-path accepts both legacy and new format. Sync emits raw `EdgePropSet` only after graph capability cutover. **Blocked on:** ADR 3 Gate 1 (historical audit, observability, capability design, rollout playbook).

**ADR 3 Gate 1 prerequisites (not yet met):**

- [ ] Historical identifier audit complete
- [ ] Observability plan exists
- [ ] Graph capability design approved
- [ ] Rollout playbook exists
- [ ] ADR 2 tripwire tests written (beyond current wire gate tests)

**M13 Gate (wire-format cutover — deferred):** Mixed-schema materialization deterministic. `WarpGraph.noCoordination.test.js` passes with v3+v4 writers. No regression in existing patch replay. Full test suite green. ADR 3 Gate 1 and Gate 2 both satisfied.

---

## Milestone 14 — HYGIENE ⚠️ TOP PRIORITY

**Theme:** Test quality, DRY extraction, SOLID quick-wins
**Objective:** Fix every actionable finding from the HEX_AUDIT (hexagonal architecture, SOLID, DRY, test brittleness audit). Harden test determinism, extract duplicated infrastructure code, and clean up low-hanging SOLID violations. Larger decompositions (WarpGraph god object, JoinReducer split) are scoped as design-only items — implementation deferred until an RFC is filed.
**Triage date:** 2026-03-02
**Audit source:** `docs/HEX_AUDIT.convo.txt`

### Audit Summary

- **Hexagonal architecture** — CLEAN (no violations)
- **Port/adapter contracts** — CLEAN (all 14 ports fully implemented)
- **SOLID** — 7 SRP, 3 OCP, 1 LSP, 1 ISP, 1 DIP findings
- **DRY** — 10 patterns, ~300–400 duplicated lines
- **Test quality** — 4 critical, 2 high, 6 medium, 1 low-medium finding

### M14.T1 — Test Hardening (Critical + High)

- **Status:** `DONE`
- **Size:** M | **Risk:** LOW
- **Depends on:** —

**Items:**

- **B130** ✅ (PRIVATE-FIELD TEST ACCESS) — Replaced `_idToShaCache` access in `BitmapIndexReader.test.js` with public `shardOids`/`loadedShards` assertions. Replaced `_snapshotState` in `PatchBuilderV2.snapshot.test.js` with spy call-count assertions. Replaced `_cachedState` in `WarpGraph.timing.test.js` with `await graph.materialize()`. `_syncController` mocking retained (B142 territory).
- **B131** ✅ (FAKE TIMER LIFECYCLE) — Moved `vi.useFakeTimers()` from `beforeAll` to `beforeEach` and `vi.useRealTimers()` into `afterEach` in `WarpGraph.watch.test.js`. `clock.now.mock.calls.length` assertion in `WarpGraph.timing.test.js:71` left as-is (already idiomatic).

### M14.T2 — Test Determinism (Medium)

- **Status:** `DONE`
- **Size:** S | **Risk:** LOW
- **Depends on:** —

**Items:**

- **B132** ✅ (SEED NON-DETERMINISTIC TESTS) — Replaced `Math.random()` with seeded RNG (Mulberry32, `0xDEADBEEF`) in `benchmarkUtils.js` and `ReducerV5.benchmark.js`. Added `seed: 42` to all 8 `fc.assert()` calls in `Join.property.test.js`. Replaced random delays in `GitGraphAdapter.stress.test.js` with deterministic values. Documented `crypto.randomUUID()` in `SyncAuthService.test.js` as intentional.
- **B133** ✅ (GLOBAL STATE POLLUTION) — Added comments documenting intentional `globalThis.Buffer` mutation in `noBufferGlobal.test.js` (already safely scoped in try/finally). `WarpGraph.watch.test.js` fake-timer leak fixed by B131.

### M14.T3 — DRY: Message Codec Template (~200 lines)

- **Status:** `DONE`
- **Size:** M | **Risk:** MEDIUM
- **Depends on:** —

**Items:**

- **B134** ✅ (CODEC TRAILER TEMPLATE) — Created `src/domain/services/TrailerValidation.js` with `requireTrailer()`, `parsePositiveIntTrailer()`, `validateKindDiscriminator()`. Refactored all 4 codec decoders (Anchor, Audit, Checkpoint, Patch) to use shared helpers. Error messages byte-for-byte identical. Net -18 lines.
- **B138** ✅ (SHARED POSITIVE INTEGER VALIDATION) — Absorbed into B134 via `parsePositiveIntTrailer()` helper.

### M14.T4 — DRY: HTTP Adapter Extraction (~120 lines)

- **Status:** `DONE`
- **Size:** M | **Risk:** MEDIUM
- **Depends on:** —

**Items:**

- **B135** ✅ (HTTP STREAM + ERROR HELPERS) — Created `src/infrastructure/adapters/httpAdapterUtils.js` with `MAX_BODY_BYTES`, `readStreamBody()`, and `noopLogger`. All 3 HTTP adapters import from shared module. Net -29 lines.

### M14.T5 — DRY: Small Extractions Batch

- **Status:** `DONE` (B136 done; B137, B139 deferred; B138 absorbed into T3)
- **Size:** S | **Risk:** LOW
- **Depends on:** —

**Items:**

- **B136** ✅ (SHARED `computeChecksum`) — Created `src/domain/utils/checksumUtils.js`. Both `BitmapIndexBuilder.js` and `StreamingBitmapIndexBuilder.js` import from shared module.
- **B137** (SHARED FRONTIER SERIALIZATION) — DEFERRED. The two implementations differ in I/O model (sync in-memory vs async blob storage). Extraction adds complexity, not value.
- **B138** ✅ — Absorbed into M14.T3/B134 via `parsePositiveIntTrailer()`.
- **B139** (SHARED LAMPORT INCREMENT) — DEFERRED. Only 2 sites, semantically distinct contexts — no DRY gain.

### M14.T6 — SOLID Quick Wins

- **Status:** `DONE` (B140, B141 done; B142 deferred)
- **Size:** S | **Risk:** LOW
- **Depends on:** —

**Items:**

- **B140** ✅ (REMOVE DEPRECATED CLOCK ALIASES) — Deleted `PerformanceClockAdapter.js` and `GlobalClockAdapter.js`. Removed from `index.js`, `index.d.ts`, `type-surface.m8.json`, and export tests. Breaking change ships under `[Unreleased]`.
- **B141** ✅ (BITMAPNEIGHBORPROVIDER LAZY VALIDATION) — Moved constructor throw to `_assertReady()` guard at top of `getNeighbors()` and `hasNode()`. Constructor now accepts empty `{}` for lazy init.
- **B142** (ERROR MESSAGE STRING MATCHING) — DEFERRED. 296 instances require per-assertion human judgment. Too large for one session.

### M14.T7 — SOLID Design Sketches (no implementation)

- **Status:** `DONE`
- **Size:** S | **Risk:** LOW
- **Depends on:** —

Design-only items. RFCs filed — implementation deferred to future milestones.

**Items:**

- **B143** ✅ (WARPGRAPH DECOMPOSITION RFC) — `docs/design/warpgraph-decomposition.md`. Three-phase extraction: SubscriptionManager → ProvenanceManager → CacheCoordinator. Reduces WarpGraph from 38 slots to 29 (24 own + 5 delegated).
- **B144** ✅ (JOINREDUCER SPLIT RFC) — `docs/design/joinreducer-split.md`. Four-module extraction: WarpStateFactory, OpValidator, ReceiptBuilder, DiffCalculator. JoinReducer shrinks from 1096 to ~350 LOC core + re-exports.
- **B145** ✅ (GRAPHPERSISTENCEPORT NARROWING RFC) — `docs/design/persistence-port-narrowing.md`. Phase 1: JSDoc narrowing to focused port intersections. Phase 2: Remove ConfigPort from composite (23 → 21 methods). Implementation order: B145 → B144 → B143.

**M14 Gate:** All private-field test access eliminated. Fake timers properly scoped. All property tests seeded. Codec trailer template extracted. HTTP stream helpers extracted. Small DRY extractions landed. Deprecated aliases removed. `WarpGraph.noCoordination.test.js` passes. Full test suite green. Lint clean.

---

## Milestone 11 — COMPASS II ✅ COMPLETE (v13.0.0)

Archived to [COMPLETED.md](docs/ROADMAP/COMPLETED.md#milestone-11--compass-ii).

---

## Standalone Lane (Ongoing)

45 active items sorted into priority tiers. Guiding principles: (1) harden first — correctness, memory safety, test infra, CI gates before features; (2) large-graph support is forward-looking — medium priority; (3) CI & Tooling items batch into one PR.

> Completed standalone items archived in [COMPLETED.md](docs/ROADMAP/COMPLETED.md#standalone-lane--completed-items).

### P0 — Quick Wins (unblock other work, trivial effort)

No dependencies. Do these first.

| ID | Item | Effort |
|----|------|--------|
| B154 | **`transitiveReduction` REDUNDANT ADJLIST COPY** — after receiving `_neighborEdgeMap` from topo sort, builds a second `adjList: Map<string, string[]>` by extracting neighborIds. Two representations of the same edge set in memory simultaneously. Should use `_neighborEdgeMap` directly, accessing `.neighborId` inline during BFS. **File:** `src/domain/services/GraphTraversal.js`. **Unblocks:** B150 (P4) | XS |
| B97 | **AUDIT MANIFEST vs `index.js` DRIFT** — manifest has 70 entries, `index.js` has 66 exports. 4 stale or type-only entries need reconciliation. From B-TYPE-2. **Files:** `contracts/type-surface.m8.json`, `index.js`. **Unblocks:** B85 → B57 (P2 chain) | S |
| B81 | **`attachContent` ORPHAN BLOB GUARD** — `attachContent()` unconditionally writes blob before `setProperty()`. Validate before push to prevent orphan blobs. From B-CODE-2. **File:** `src/domain/services/PatchBuilderV2.js` | S |

### P1 — Correctness & Test Infrastructure

B36 and B37 improve velocity for all future test work — do them early. B19 + B22 batch as one PR (Conformance Property Pack). B165 and B167 completed (Defensive Hardening Sprint); B166 remains.

| ID | Item | Effort |
|----|------|--------|
| B165 | ✅ **WARPSERVESERVICE `listen()` DEFERRED STATE MUTATION** — `listen()` now defers `_server` assignment and subscription registration until bind succeeds; on failure, cleans up subscriptions. `_onConnection` catch now sends generic `"Internal error"` instead of raw `err.message`. **File:** `src/domain/services/WarpServeService.js` | S |
| B166 | **ADAPTER CLEANUP CONTRACTS** — `NodeWsAdapter.close()` doesn't reset `state.wss`/`state.httpServer`/remove listeners after shutdown; `listenWithHttp` error path leaks partial state. **File:** `src/infrastructure/adapters/NodeWsAdapter.js` | M |
| B167 | ✅ **SERVE TEST COVERAGE GAPS** — Added tests for: listen-failure cleanup (leaked subscriptions), double-listen guard, error sanitization (no internal detail leakage), `attachContent`/`attachEdgeContent` smoke tests through mutation pipeline. **File:** `test/unit/domain/services/WarpServeService.test.js` | S |
| B36 | **FLUENT STATE BUILDER FOR TESTS** — `StateBuilder` helper replacing manual `WarpStateV5` literals | M |
| B37 | **SHARED MOCK PERSISTENCE FIXTURE** — dedup `createMockPersistence()` across trust test files | S |
| B48 | **ESLINT BAN `= {}` CONSTRUCTOR DEFAULTS WITH REQUIRED PARAMS** — catches the pattern where `= {}` silently makes required options optional at the type level (found in CommitDagTraversalService, DagTraversal, DagPathFinding, DagTopology, BitmapIndexReader) | S |
| B80 | **CHECKPOINTSERVICE CONTENT BLOB UNBOUNDED MEMORY** — iterates all properties into single `Set` before tree serialization. Stream content OIDs in batches. From B-AUDIT-10 (JANK). **File:** `src/domain/services/CheckpointService.js:224-226` | M |
| B99 | **DETERMINISM FUZZER FOR TREE CONSTRUCTION** — property-based test randomizing content blob insertion order in `PatchBuilderV2` and content OID iteration order in `CheckpointService.createV5()`, verifying identical tree OID. From B-FEAT-2. **File:** new test in `test/unit/domain/services/` | M |
| B19 | **CANONICAL SERIALIZATION PROPERTY TESTS** — fuzz `canonicalStringify`; verify idempotency, determinism, round-trip stability. Golden fixtures test known paths; property tests test unknown edge combinations. | S |
| B22 | **CANONICAL PARSE DETERMINISM TEST** — verify `canonicalStringify(TrustRecordSchema.parse(record))` produces identical output across repeated calls. Batch with B19 as one PR. | S |

### P2 — CI & Tooling (one batch PR)

**Internal chain:** B97 (P0) → B85 → B57 — must complete P0 first. B123 is the largest item — may need to split out if the PR gets too big.

| ID | Item | Depends on | Effort |
|----|------|------------|--------|
| B83 | **DEDUP CI `type-firewall` AND `lint` JOBS** — merge into one job (add `npm audit` to `type-firewall`, drop `lint`) or chain with `needs:`. From B-CI-1. **File:** `.github/workflows/ci.yml` | — | S |
| B85 | **TYPE-ONLY EXPORT MANIFEST SECTION** — `typeExports` section in `type-surface.m8.json` to catch accidental type removal from `index.d.ts`. From B-CI-3. **Files:** `contracts/type-surface.m8.json`, `scripts/check-dts-surface.js` | B97 (P0) | S |
| B57 | **CI: AUTO-VALIDATE `type-surface.m8.json` AGAINST `index.d.ts`** — add a CI gate or pre-push check that parses the manifest and confirms every declared method/property/return type matches the corresponding signature in `index.d.ts`; prevents drift like the missing `setSeekCache` and `syncWith.state` return found in review | B97, B85 | M |
| B86 | **MARKDOWNLINT CI GATE** — catch MD040 (missing code fence language) etc. From B-DOC-1. **File:** `.github/workflows/ci.yml` | — | S |
| B87 | **CODE SAMPLE LINTER** — syntax-check JS/TS code blocks in markdown files via `eslint-plugin-markdown` or custom extractor. From B-DOC-2. **Files:** new script, `docs/**/*.md` | — | M |
| B88 | **MERMAID RENDERING SMOKE TEST** — parse all ` ```mermaid ` blocks with `@mermaid-js/mermaid-cli` in CI. From B-DIAG-2. **File:** `.github/workflows/ci.yml` or `scripts/` | — | S |
| B119 | **`scripts/pr-ready` MERGE-READINESS CLI** — single tool aggregating unresolved review threads, pending/failed checks, CodeRabbit status/cooldown, and human-review count into one deterministic verdict. From BACKLOG 2026-02-27/28. | — | M |
| B123 | **BENCHMARK BUDGETS + CI REGRESSION GATE** — define perf thresholds for eager post-commit and materialize hash cost; fail CI on agreed regression. From BACKLOG 2026-02-27. | — | L |
| B128 | **DOCS CONSISTENCY PREFLIGHT** — automated pass in `release:preflight` verifying changelog/readme/guide updates for behavior changes in hot paths (materialize, checkpoint, sync). From BACKLOG 2026-02-28. | — | S |
| B12 | **DOCS-VERSION-SYNC PRE-COMMIT CHECK** — grep version literals in .md files against `package.json` | — | S |
| B43 | **VITEST EXPLICIT RUNTIME EXCLUDES** — prevent accidental local runs of Docker-only suites | — | S |

### P3 — Type Safety & Surface

No hard dependencies. Pick up opportunistically after P2.

| ID | Item | Effort |
|----|------|--------|
| B95 | **NAMESPACE EXPORT SUPPORT** — handle `export declare namespace Foo` in surface validator. From B-SURF-5. **File:** `scripts/check-dts-surface.js` | S |
| B96 | **CONSUMER TEST TYPE-ONLY IMPORT COVERAGE** — exercise all exported types beyond just declaring variables. Types like `OpOutcome`, `TraversalDirection`, `LogLevelValue` aren't tested at all. From B-TYPE-1. **File:** `test/type-check/consumer.ts` | M |
| B98 | **TEST-FILE WILDCARD RATCHET** — `ts-policy-check.js` excludes test files entirely. Add separate ratchet with higher threshold or document exclusion as intentional. From B-TYPE-3. **File:** `scripts/ts-policy-check.js` | S |
| B54 | **`typedCustom()` ZOD HELPER** — `z.custom()` without a generic yields `unknown` in JS; a JSDoc-friendly wrapper (or `@typedef`-based pattern) would eliminate verbose `/** @type {z.ZodType<T>} */ (z.custom(...))` casts across HttpSyncServer and future Zod schemas | S |
| B49 | **TIGHTEN `checkDeclarations` INLINE COMMENT STRIPPING** — strip trailing `//` and `/* */` comments before checking for `any` in `ts-policy-check.js`; low priority but closes theoretical false-positive gap | XS |
| B28 | **PURE TYPESCRIPT EXAMPLE APP** — CI compile-only stub (`tsc --noEmit` on minimal TS consumer). | M |

### P4 — Large-Graph Performance (forward-looking)

**Execution order:** B154 (P0) → B153 → B149 + B150 (parallel) → B151 → B152. B153 is the keystone — fixes topo sort memory, which cascades to B149 and B150.

| ID | Item | Depends on | Effort |
|----|------|------------|--------|
| B153 | **`topologicalSort` LIGHTWEIGHT MODE** — discovery phase unconditionally builds `adjList` + `neighborEdgeMap` (O(V+E)) even when `_returnAdjList` is false. Add a `_lightweight` mode that only tracks in-degree counts during discovery and re-fetches neighbors from provider during Kahn processing. Reduces topo sort memory from O(V+E) to O(V). Root cause behind B149/B150 — both inherit full-graph materialization from their topo sort call. **File:** `src/domain/services/GraphTraversal.js` | — | M |
| B149 | **LARGE-GRAPH `levels()` — TWO-PASS STREAMING** — `levels()` currently holds O(V+E) via `topologicalSort({ _returnAdjList: true })`. Refactor to two-pass: (1) topo sort discards edge cache, (2) DP pass re-fetches neighbors from provider. Reduces steady-state memory from O(V+E) to O(V). Trade-off: one extra I/O pass over edges. **File:** `src/domain/services/GraphTraversal.js` | B153 | M |
| B150 | **LARGE-GRAPH `transitiveReduction()` — ON-DEMAND NEIGHBOR FETCH** — `transitiveReduction()` holds full adjacency list from topo sort AND builds a second `Map<string, string[]>` for per-node BFS. Refactor BFS phase to call `getNeighbors()` on demand instead of caching. Reduces memory from O(V+E) to O(V) working set per BFS sweep. Trade-off: redundant provider calls. Consider provider-level LRU to amortize. **File:** `src/domain/services/GraphTraversal.js` | B153, B154 (P0) | M |
| B151 | **LARGE-GRAPH `transitiveClosure()` — STREAMING OUTPUT** — `transitiveClosure()` collects all O(V²) reachability edges in an array before returning. For large graphs this can exhaust memory even with `maxEdges`. Refactor to async iterator/generator that yields `{from, to}` pairs as they're discovered. Per-node BFS working memory is already O(V); the bottleneck is the output array. **File:** `src/domain/services/GraphTraversal.js` | — | M |
| B152 | **ASYNC GENERATOR TRAVERSAL API** — streaming variants of all GraphTraversal algorithms (`bfsStream()`, `dfsStream()`, etc.) returning `AsyncGenerator` instead of collected arrays. Enables early break, backpressure, and pipeline composition. Array-returning methods become sugar over `collect()`. Generalizes B151 to the full traversal surface. **File:** `src/domain/services/GraphTraversal.js` | B151 | L |

### P5 — Features & Visualization

| ID | Item | Effort |
|----|------|--------|
| B155 | **`levels()` AS LIGHTWEIGHT `--view` LAYOUT** — `levels()` is exactly the Y-axis assignment a layered DAG layout needs. For simple DAGs, `levels()` + left-to-right X sweep could produce clean layouts without the 2.5MB ELK import. Offer `--view --layout=levels` as an instant rendering mode, reserving ELK for complex graphs. **Files:** `src/visualization/layouts/`, `bin/cli/commands/view.js` | M |
| B156 | **STRUCTURAL DIFF VIA TRANSITIVE REDUCTION** — compute `transitiveReduction(stateA)` vs `transitiveReduction(stateB)` to produce a compact structural diff that strips implied edges and shows only "load-bearing" changes. Natural fit for H1 (Time-Travel Delta Engine) as `warp diff --mode=structural`. | L |
| B157 | ✅ **BROWSER COMPATIBILITY (Phase 1-3)** — Make `InMemoryGraphAdapter` and `defaultCrypto` browser-safe by lazy-loading `node:crypto`/`node:stream`. New `sha1sync` utility for browser content addressing. New `browser.js` entry point and `./browser`+`./sha1sync` package exports. | M |

### P6 — Documentation & Process

Low urgency. Fold into PRs that already touch related files.

| ID | Item | Effort |
|----|------|--------|
| B34 | **DOCS: SECURITY_SYNC.md** — extract threat model from JSDoc into operator doc | M |
| B35 | **DOCS: README INSTALL SECTION** — Quick Install with Docker + native paths | S |
| B76 | **WARPGRAPH INVISIBLE API SURFACE DOCS** — add `// API Surface` block listing all 40+ dynamically wired methods with source module. Consider generating as build step. From B-AUDIT-4 (STANK). **File:** `src/domain/WarpGraph.js:451-478` | M |
| B79 | **WARPGRAPH CONSTRUCTOR LIFECYCLE DOCS** — document cache invalidation strategy for 25 instance variables: which operations dirty which caches, which flush them. From B-AUDIT-16 (TSK TSK). **File:** `src/domain/WarpGraph.js:69-198`. **Depends on:** B143 RFC (exists) | M |
| B102 | **API EXAMPLES REVIEW CHECKLIST** — add to `CONTRIBUTING.md`: each `createPatch()`/`commit()` uses own builder, async methods `await`ed, examples copy-pasteable. From B-DOC-3. | S |
| B103 | **BATCH REVIEW FIX COMMITS** — batch all review fixes into one commit before re-requesting CodeRabbit. Reduces duplicate findings across incremental pushes. From B-DX-2. | XS |
| B104 | **MERMAID DIAGRAM CONTENT CHECKLIST** — for diagram migrations: count annotations in source/target, verify edge labels survive, check complexity annotations preserved. From B-DIAG-1. | XS |
| B129 | **CONTRIBUTOR REVIEW-LOOP HYGIENE GUIDE** — add section to `CONTRIBUTING.md` covering commit sizing, CodeRabbit cooldown strategy, and when to request bot review. From BACKLOG 2026-02-27. | S |
| B147 | **RFC FIELD COUNT DRIFT DETECTOR** — script that counts WarpGraph instance fields (grep `this._` in constructor) and warns if design RFC field counts diverge. Prevents stale numbers in `warpgraph-decomposition.md`. From B145 PR review. **Depends on:** B143 RFC (exists) | S |

### P7 — git-cas Modernization

Upgrade from `@git-stunts/git-cas` v3.0.0 to v5.3.0 and leverage new capabilities. Currently git-warp uses git-cas for the seek cache (`CasSeekCacheAdapter`) and blob attachments (`CasBlobAdapter`). The v4.x/v5.x releases add ObservabilityPort, streaming restore, CDC chunking (98.4% chunk reuse on edits), envelope encryption (DEK/KEK), key rotation, memory restore guards, and constructor validation.

| ID | Item | Effort |
|----|------|--------|
| B158 | ✅ **UPGRADE `@git-stunts/git-cas` TO v5** — bumped `^3.0.0` → `^5.3.0`. 4928 tests pass, zero regressions. | S |
| B159 | ✅ **CDC CHUNKING FOR SEEK CACHE** — `CasSeekCacheAdapter._initCas()` now constructs CAS with `chunking: { strategy: 'cdc' }`. ~98% chunk reuse on incremental snapshots. | S |
| B160 | ✅ **BLOB ATTACHMENTS VIA CAS** — New `BlobStoragePort` + `CasBlobAdapter` provide a hexagonal abstraction for content blob storage. `PatchBuilderV2.attachContent()`/`attachEdgeContent()` use CAS (chunked, CDC-deduped, optionally encrypted) when `blobStorage` is injected; fall back to raw `persistence.writeBlob()` without it. `getContent()`/`getEdgeContent()` retrieve via `blobStorage.retrieve()` with automatic fallback to raw Git blobs for pre-CAS content. Wired through `WarpGraph`, `Writer`, and all patch creation paths. 16 new tests (4909 total). | M |
| B161 | ✅ **ENCRYPTED SEEK CACHE** — `CasSeekCacheAdapter` now accepts optional `encryptionKey` constructor param. When set, all `store()` and `restore()` calls pass the key to git-cas for AES-256-GCM encryption/decryption. 6 new tests (52 total). | S |
| B162 | ✅ **OBSERVABILITY ALIGNMENT** — new `LoggerObservabilityBridge` adapter translates git-cas `ObservabilityPort` calls (metric, log, span) into git-warp `LoggerPort` calls. `CasSeekCacheAdapter` accepts optional `logger` param; when provided, CAS operations surface through git-warp's structured logging. 7 new bridge tests + 2 adapter tests. | M |
| B163 | ✅ **STREAMING RESTORE FOR LARGE STATES** — `CasSeekCacheAdapter.get()` now prefers `cas.restoreStream()` (git-cas v4+) for I/O pipelining, accumulating chunks via async iterator. Falls back to `cas.restore()` for older git-cas. 2 new tests (58 total). | M |
| B164 | ✅ **GRAPH ENCRYPTION AT REST** — New `patchBlobStorage` option on `WarpGraph.open()`. When a `BlobStoragePort` (e.g. `CasBlobAdapter` with encryption key) is injected, patch CBOR is written/read via CAS instead of raw Git blobs. `eg-encrypted: true` trailer marks encrypted commits. All 6 read sites + write path threaded. `EncryptionError` thrown when reading encrypted patches without key. Mixed encrypted/plain patches supported via backward-compatible fallback. 14 new tests (4969 total). | L |

### Uncategorized / Platform

| ID | Item | Effort |
|----|------|--------|
| B53 | **FIX JSR PUBLISH DRY-RUN DENO PANIC** — Deno 2.6.7 `deno_ast` panics on overlapping text changes from duplicate `roaring` import rewrites; either pin Deno version, vendor the import, or file upstream issue and add workaround. Promote if JSR publish becomes imminent. | M |
| B127 | **DENO SMOKE TEST** — `npm run test:deno:smoke` for fast local pre-push confidence without full Docker matrix. From BACKLOG 2026-02-25. | S |

---

## Deferred (With Triggers)

Items parked with explicit conditions for promotion.

| ID | Item | Trigger |
|----|------|---------|
| B4 | **WARP UI VISUALIZER** | Promote when RFC filed with scoped UX goals |
| B7 | **DOCTOR: PROPERTY-BASED FUZZ TEST** | Promote when doctor check count exceeds 8 |
| B16 | **`unsignedRecordForId` EDGE-CASE TESTS** | Promote if canonical format changes |
| B20 | **TRUST RECORD ROUND-TRIP SNAPSHOT TEST** | Promote if trust record schema changes |
| B21 | **TRUST SCHEMA DISCRIMINATED UNION** | Promote if superRefine causes a bug or blocks a feature |
| B27 | **`TrustKeyStore` PRE-VALIDATED KEY CACHE** | Promote when `verifySignature` appears in any p95 flame graph above 5% of call time |
| ~~B100~~ | ✅ ~~**MAP vs RECORD ASYMMETRY**~~ — `getNodeProps()` now returns `Record<string, unknown>`. Done in v13.0.0. | ~~Promote with next major version RFC~~ |
| B101 | **MERMAID `~~~` INVISIBLE-LINK FRAGILITY** — undocumented Mermaid feature for positioning. From B-DIAG-3. | Promote if Mermaid renderer update breaks `~~~` positioning |

---

## Rejected (see GRAVEYARD.md)

B5, B6, B13, B17, B18, B25, B45 — rejected 2026-02-17 with cause recorded in `GRAVEYARD.md`.

---

## Execution Order

### Milestones (all complete)

1. **M10 SENTINEL** — Trust + sync safety + correctness — **DONE**
2. **M12 SCALPEL** — STANK audit cleanup (minus edge prop encoding) — **DONE**
3. **M13 SCALPEL II** — Edge property canonicalization — **DONE** (internal; wire-format deferred by ADR 3)
4. **M11 COMPASS II** — Developer experience — ✅ **DONE** (v13.0.0), archived
5. **M14 HYGIENE** — Test quality, DRY extraction, SOLID quick-wins — **DONE**

### Standalone Execution Waves

Guiding principles: (1) harden first — correctness, memory safety, test infra, CI gates before features; (2) large-graph support is forward-looking — medium priority; (3) CI & Tooling items batch into one PR.

#### Wave 1: Foundation (P0 + P1 start)

1. **B154** — transitiveReduction adjList dedup (XS)
2. **B97** — Manifest audit (S, unblocks P2 chain)
3. **B81** — Orphan blob guard (S, correctness)
4. **B36** — Fluent StateBuilder (M, test DX)
5. **B37** — Shared mock persistence (S, test DRY)

#### Wave 2: Correctness (P1 finish)

6. **B48** — ESLint `= {}` defaults rule (S)
7. **B80** — CheckpointService memory streaming (M)
8. **B19 + B22** — Conformance property pack (S, one PR)
9. **B99** — Determinism fuzzer (M)

#### Wave 3: CI & Tooling (P2, one batch PR)

10. **B83, B85, B57, B86, B87, B88, B119, B123, B128, B12, B43**

Internal chain: B97 (P0, Wave 1) → B85 → B57. B123 is the largest — may split out.

#### Wave 4: Type Surface (P3)

11. **B95, B96, B98, B54, B49** — batch or cherry-pick
12. **B28** — TypeScript example app

#### Wave 5: Large-Graph (P4)

13. **B153** — topologicalSort lightweight mode (keystone)
14. **B149 + B150** — levels + transitiveReduction streaming (parallel after B153)
15. **B151** — transitiveClosure streaming output
16. **B152** — full async generator API

#### Wave 6: Features + Docs (P5 + P6)

17. **B155** — levels() as --view layout
18. **B156** — structural diff (if H1 is in play)
19. Docs/process items (B34, B35, B76, B79, B102–B104, B129, B147) folded into related PRs

#### Wave 7: git-cas Modernization (P7)

20. **B158** — upgrade `@git-stunts/git-cas` to v5 (unblocks all P7 items)
21. **B159** — CDC chunking for seek cache (quick win after B158)
22. **B161** — encrypted seek cache
23. **B160** — blob attachments via CAS
24. **B162** — observability alignment
25. **B163** — streaming restore for large states
26. **B164** — graph encryption at rest (largest, last)

### Dependency Chains

```text
B97 (P0) ──→ B85 (P2) ──→ B57 (P2)
              manifest      auto-validate

B153 (P4) ──→ B149 (P4)   levels() streaming
          └──→ B150 (P4)   transitiveReduction() streaming
                ↑
B154 (P0) ─────┘           adjList dedup (quick fix)

B151 (P4) ──→ B152 (P4)   closure streaming → full async generator API

B36 (P1) ──→ (improves velocity for B99, B19, B22, future tests)

B158 (P7) ──→ B159 (P7)   CDC seek cache
          ├──→ B160 (P7)   blob attachments
          ├──→ B161 (P7)   encrypted seek cache
          ├──→ B162 (P7)   observability alignment
          ├──→ B163 (P7)   streaming restore
          └──→ B164 (P7)   graph encryption at rest
```

---

## Inventory

### By Status

| Status | Count | IDs |
|--------|-------|-----|
| **Milestone (M10)** | 7 | B1, B2(spec), B39, B40, B63, B64, B65 |
| **Milestone (M11)** | 3 | B2(impl), B3, B11 |
| **Milestone (M12)** | 18 | B66, B67, B70, B73, B75, B105–B115, B117, B118 |
| **Milestone (M13)** | 1 | B116 (internal: DONE; wire-format: DEFERRED) |
| **Milestone (M14)** | 16 | B130–B145 |
| **Standalone** | 46 | B12, B19, B22, B28, B34–B37, B43, B48, B49, B53, B54, B57, B76, B79–B81, B83, B85–B88, B95–B99, B102–B104, B119, B123, B127–B129, B147, B149–B156, B166 |
| **Standalone (done)** | 39 | B26, B44, B46, B47, B50–B52, B55, B71, B72, B77, B78, B82, B84, B89–B94, B100, B120–B122, B124, B125, B126, B146, B148, B157, B158, B159, B160, B161, B162, B163, B164, B165, B167 |
| **Deferred** | 7 | B4, B7, B16, B20, B21, B27, B101 |
| **Rejected** | 7 | B5, B6, B13, B17, B18, B25, B45 |
| **Total tracked** | **144** total; 39 standalone done | |

### STANK.md Cross-Reference

| STANK ID | Severity | B# | Disposition |
|----------|----------|-----|-------------|
| C1 | CRIT | B105 | M12.T1 |
| C2 | CRIT | B106 | M12.T1 |
| C3 | CRIT | B109 | M12.T3 |
| C4 | CRIT | — | FIXED (M10) |
| C5 | CRIT | B110 | M12.T3 |
| C6 | CRIT | — | FIXED (M10) |
| C7 | CRIT | B111 | M12.T3 |
| C8 | CRIT | B112 | M12.T3 |
| S1 | STANK | B108 | M12.T2 |
| S2 | STANK | B116 | M13 (internal: DONE via ADR 1; wire-format: DEFERRED via ADR 2/3) |
| S3 | STANK | B107 | M12.T1 |
| S4 | STANK | B72 | FIXED (M10) |
| S5 | STANK | B66 | FIXED (M12.T4) |
| S6 | STANK | B113 | FIXED (M12.T4) |
| S7 | STANK | B114 | M12.T5 |
| S8 | STANK | B115 | M12.T5 |
| S9 | STANK | — | FIXED (M10) |
| J1 | JANK | B68 | FIXED (M10) |
| J2 | JANK | B69 | FIXED (M10) |
| J3 | JANK | B117 | M12.T8 |
| J4 | JANK | B117 | M12.T8 |
| J5 | JANK | — | FIXED (M10) |
| J6 | JANK | B117 | M12.T8 |
| J7 | JANK | B117 | M12.T8 |
| J8 | JANK | — | FIXED (M10) |
| J9 | JANK | B117 | M12.T8 |
| J10 | JANK | B117 | M12.T8 |
| J11 | JANK | — | FIXED (M10) |
| J12 | JANK | B117 | M12.T8 |
| J13 | JANK | B117 | M12.T8 |
| J14 | JANK | B117 | M12.T8 |
| J15 | JANK | B117 | M12.T8 |
| J16 | JANK | B117 | M12.T8 |
| J17 | JANK | B117 | M12.T8 |
| J18 | JANK | B117 | M12.T8 |
| J19 | JANK | B117 | M12.T8 |
| T1 | TSK TSK | B67 | M12.T9 |
| T2 | TSK TSK | B73 | M12.T9 |
| T3–T8 | TSK TSK | B118 | M12.T9 |
| T9 | TSK TSK | B75 | M12.T9 |
| T10–T31 | TSK TSK | B118 | M12.T9 |
| T32 | TSK TSK | B74 | M12.T9 |
| T33–T38 | TSK TSK | B118 | M12.T9 |

### B-Number Cross-Reference (Backlog → Roadmap)

| Backlog ID | B# | Disposition |
|---|---|---|
| B-AUDIT-1 (CRIT) | B63 | M10 |
| B-AUDIT-2 (CRIT) | B66 | M12 |
| B-AUDIT-3 (STANK) | B67 | M12 |
| B-AUDIT-4 (STANK) | B76 | Standalone Near-Term |
| B-AUDIT-5 (STANK) | B68 | M12 (DONE) |
| B-AUDIT-6 (JANK) | B69 | M12 (DONE) |
| B-AUDIT-7 (JANK) | B64 | M10 |
| B-AUDIT-8 (JANK) | B75 | M12.T9 |
| B-AUDIT-9 (JANK) | B71 | Standalone Immediate |
| B-AUDIT-10 (JANK) | B80 | Standalone Near-Term |
| B-AUDIT-11 (JANK) | B65 | M10 |
| B-AUDIT-12 (TSK TSK) | B72 | Standalone (DONE) |
| B-AUDIT-13 (TSK TSK) | B77 | Standalone Near-Term |
| B-AUDIT-14 (TSK TSK) | B73 | M12.T9 |
| B-AUDIT-15 (TSK TSK) | B78 | Standalone Near-Term |
| B-AUDIT-16 (TSK TSK) | B79 | Standalone Near-Term |
| B-AUDIT-17 (TSK TSK) | B74 | M12.T9 |
| B-CI-1 | B83 | CI & Tooling Pack |
| B-CI-2 | B84 | CI & Tooling Pack |
| B-CI-3 | B85 | CI & Tooling Pack |
| B-SURF-1 | B91 | Surface Validator Pack |
| B-SURF-2 | B92 | Surface Validator Pack |
| B-SURF-3 | B93 | Surface Validator Pack |
| B-SURF-4 | B94 | Surface Validator Pack |
| B-SURF-5 | B95 | Surface Validator Pack |
| B-TYPE-1 | B96 | Type Surface Pack |
| B-TYPE-2 | B97 | Type Surface Pack |
| B-TYPE-3 | B98 | Type Surface Pack |
| B-FEAT-2 | B99 | Content Attachment |
| B-FEAT-3 | B100 | Deferred |
| B-DOC-1 | B86 | CI & Tooling Pack |
| B-DOC-2 | B87 | CI & Tooling Pack |
| B-DOC-3 | B102 | Process |
| B-CODE-1 | B70 | M12.T7 |
| B-CODE-2 | B81 | Standalone Near-Term |
| B-DX-1 | B82 | Standalone Near-Term |
| B-DX-2 | B103 | Process |
| B-DIAG-1 | B104 | Process |
| B-DIAG-2 | B88 | CI & Tooling Pack |
| B-DIAG-3 | B101 | Deferred |
| B-REL-1 | B89 | CI & Tooling Pack (DONE) |
| B-REL-2 | B90 | CI & Tooling Pack (DONE) |

---

## Final Command

Every milestone has a hard gate. No milestone blurs into the next.
All milestones are complete: M10 → M12 → M13 (internal) → M11 → M14. M13 wire-format cutover remains deferred by ADR 3 readiness gates.

The active backlog is **45 standalone items** sorted into **6 priority tiers** (P0–P6) with **6 execution waves**. Wave 1 (foundation) targets quick wins and test infrastructure. See [Execution Order](#execution-order) for the full sequence.

Rejected items live in `GRAVEYARD.md`. Resurrections require an RFC.
`BACKLOG.md` retired — all intake goes directly into this file (policy in `CLAUDE.md`).

---

## Strategic Addendum — Post-M12 Acceleration + Risk Hardening (2026-02-27)
## Appendix — 2026-02-27 Vision Concepts + Concern Battle Plans

Exploratory concepts captured during PR hardening. These are intentionally fully scoped so they can be promoted into numbered backlog items without re-discovery work.

### Vision 1 — Index Health Snapshots (Fast Integrity Checks)

**Vision:** Add per-shard health receipts (cardinality, checksum, label-bucket coverage) so index integrity checks can short-circuit to O(changed-shards) instead of full graph/index scans.

**Mini-Battle Plan:**
1. Define a deterministic `index-health.cbor` schema keyed by shard path and include rolling checksums over shard payload bytes.
2. Emit health receipts in `LogicalIndexBuildService` and persist alongside index tree/checkpoint metadata.
3. Extend `verify-index` with `--fast` mode: validate health receipts first, then deep-scan only mismatched/unknown shards.
4. Add `--explain` output listing which shards failed and why (checksum drift, cardinality mismatch, missing bucket).

**Mitigations:**
- Keep health receipts advisory; never treat them as authoritative correctness proof.
- On missing/corrupt receipt, fall back to full verification automatically.
- Gate by feature flag until stability is proven in CI and real repos.

**Defensive Tests:**
- Determinism test: same logical state must produce byte-identical health receipts across repeated builds.
- Tamper test: mutate one shard blob; `verify-index --fast` must flag exact shard mismatch.
- Backward compatibility test: repos without receipts must still pass full verification path.

### Vision 2 — Adaptive Query Planner (Provider Selection by Cost)

**Vision:** Auto-select traversal/query provider (adjacency vs bitmap) per operation using lightweight selectivity and graph-density heuristics, while preserving deterministic result ordering.

**Mini-Battle Plan:**
1. Introduce a tiny planner cost model (estimated fanout, label filter selectivity, alive-node coverage).
2. Instrument providers with telemetry counters (`calls`, `rows_scanned`, `cache_hits`) behind debug hooks.
3. Add planner decisions to trace output (`query().explain()` and CLI `--explain-plan`).
4. Ship as opt-in (`planner: "adaptive"`) before making default.

**Mitigations:**
- Hard fallback to current deterministic provider path on planner uncertainty/error.
- Hysteresis thresholds to avoid plan thrashing across near-equal costs.
- Keep planner pure (no side effects) and independently testable.

**Defensive Tests:**
- Equivalence tests: same query result sets and ordering across forced-adjacency, forced-bitmap, adaptive.
- Stability tests: repeated runs on same state choose same plan unless stats change.
- Performance regression guard: synthetic sparse/dense fixtures verify adaptive path avoids worst-case scans.

### Vision 3 — Incremental Trust Anomaly Stream

**Vision:** Emit structured anomaly events for sync/trust pipelines (unexpected frontier jumps, writer churn spikes, trust degradation, repeated divergence) to improve operator observability.

**Mini-Battle Plan:**
1. Define anomaly event schema (`type`, `writer`, `frontierDelta`, `severity`, `evidence`).
2. Emit from `SyncController` and trust evaluators with low-cost local buffering.
3. Add CLI surface (`git warp check --anomalies`) and optional NDJSON sink for automation.
4. Add configurable suppression windows and dedupe keys to prevent alert floods.

**Mitigations:**
- Start in warn-only mode; no behavior change to sync/apply decisions.
- Scope anomaly generation to already-computed values to avoid materialization overhead.
- Explicitly document non-security vs security-signal semantics.

**Defensive Tests:**
- Replay fixtures that intentionally diverge then recover; assert anomaly sequence and severity transitions.
- Dedupe tests: repeated identical incidents produce one event per suppression window.
- Contract tests for NDJSON/event shape stability.

### Vision 4 — Checkpoint Explainability Mode

**Vision:** Attach compact human-readable checkpoint summaries (delta counts, hot labels, shard churn, top writers) to improve operational debugging and incident forensics.

**Mini-Battle Plan:**
1. Add optional `checkpoint-summary.cbor` artifact with bounded fields and deterministic ordering.
2. Extend `createCheckpoint()` and CLI checkpoint commands to emit/show summaries.
3. Add `git warp history --checkpoint-summary` and `git warp info --checkpoint-diff`.
4. Keep summary generation off critical path via optional flag and cached intermediate stats.

**Mitigations:**
- Never couple replay correctness to summary presence/format.
- Enforce strict size budget to prevent summary bloat.
- Redact sensitive values by default (counts and IDs only).

**Defensive Tests:**
- Determinism tests: same input state/history yields identical summary bytes.
- Size-limit tests: large graphs still keep summary under budget.
- Compatibility tests: loading checkpoints ignores missing/unknown summary versions.

### Vision 5 — Determinism Audit Command

**Vision:** Add a first-class determinism auditor that replays equivalent patch sets under shuffled permutations and verifies stable outputs (state hash, index shard OIDs, optional property shard OIDs).

**Mini-Battle Plan:**
1. Implement `git warp audit-determinism` with configurable permutations and seed.
2. Compare canonical output vectors (`stateHash`, `indexTreeOid`, shard hashes) and emit counterexample traces on mismatch.
3. Integrate with CI for nightly determinism sweeps on curated fixtures.
4. Add bounded quick mode for pre-push smoke checks.

**Mitigations:**
- Cap runtime by permutation budget and graph size.
- Skip expensive dimensions unless requested (`--deep-index`).
- Preserve reproducibility by always printing seed and permutation order.

**Defensive Tests:**
- Positive tests: known deterministic fixtures pass across random seeds.
- Negative tests: injected nondeterministic fixture must fail and emit reproducible counterexample.
- CLI snapshot tests for machine-readable output format.

## Concern 1 — Validation Hot-Path Overhead (`JoinReducer`)

**Concern:** `applyWithDiff`/`applyWithReceipt` validate ops before calling `applyOpV2`, which also validates, causing duplicated checks in internal loops.

**Mini-Battle Plan:**
1. Add internal `applyOpV2Validated` (or `applyOpV2(..., { skipValidate: true })`) for trusted internal paths only.
2. Keep public `applyOpV2` behavior unchanged (always validates).
3. Document boundary where pre-validation is required.

**Mitigations:**
- Use explicit internal-only function naming to avoid accidental misuse.
- Add invariant comments in callers showing where validation already occurred.
- Keep one canonical validation implementation to avoid drift.

**Defensive Tests:**
- Unit tests proving public `applyOpV2` still rejects malformed ops.
- Internal-path tests proving no behavior change vs current logic on valid ops.
- Micro-benchmark guard for diff/receipt loops showing measurable validation overhead reduction.

## Concern 2 — GC Error Triage Blind Spot (`GCPolicy.executeGC`)

**Concern:** Compaction catch path currently omits underlying exception detail, reducing observability during production triage.

**Mini-Battle Plan:**
1. Capture caught error (`catch (err)`) and include sanitized `originalError` (+ optional stack in debug mode) in `WarpError.context`.
2. Preserve existing `phase` + `partialCompaction` fields.
3. Ensure loggers redact noisy/secret payloads if stack capture enabled.

**Mitigations:**
- Keep stack inclusion behind debug flag to avoid log bloat.
- Normalize non-Error throws with `String(err)`.
- Maintain stable error code (`E_GC_COMPACT_FAILED`) for compatibility.

**Defensive Tests:**
- Throwing mock for node/edge compaction paths; assert context includes phase + originalError.
- Non-Error throw test (`throw 42`) still reports human-readable cause.
- Snapshot tests for error serialization shape.

## Concern 3 — Stale Review-Thread Triage Friction

**Concern:** Automated review comments on older commits generate manual overhead and risk unnecessary code churn.

**Mini-Battle Plan:**
1. Build `scripts/pr-review-triage.sh` to summarize unresolved/outdated threads and comment-to-HEAD drift.
2. Add maintainer docs with a strict stale-thread handling workflow.
3. Add optional CI artifact posting thread status summary to PR checks.

**Mitigations:**
- Require evidence references (file+line+test output) before resolving stale threads.
- Keep script read-only by default; no automated thread resolution.
- Fail-safe: when uncertainty exists, request clarification instead of auto-resolve.

**Defensive Tests:**
- Script fixture tests on mocked GraphQL payloads (resolved/outdated mixes).
- Golden output tests for deterministic summary formatting.
- Smoke test ensuring script exits non-zero on API/auth failures.

## ~~Concern 4 — Documentation Drift: `ROADMAP.md` vs `BACKLOG.md`~~ RESOLVED

Single-source policy enacted: `ROADMAP.md` is the sole document. `BACKLOG.md` deleted. Policy codified in `CLAUDE.md`.

## Appendix — Horizon Visions and Defensive Campaigns (2026-02-27)

This section appends forward-looking concepts and risk controls discovered while implementing B114/B115.
These are intentionally detailed, but remain unnumbered candidates until explicitly promoted into milestone inventory.

### Innovation Concept I1 — Incremental Canonical State Hashing

**Vision**
Eliminate full canonical sort/serialize/hash on every clean-cache write. Move from O(V+E+P) hash recompute to O(changed-entities) incremental hash maintenance, while preserving deterministic state hash parity with `computeStateHashV5()`.

**Why this matters**
Diff-aware eager post-commit reduced index rebuild cost, but hash recomputation can still dominate large state commits. This is now the next hot-path bottleneck.

**Mini battle plan**
1. Add a feature-gated `StateHashAccumulator` service with deterministic per-collection digests (`nodes`, `edges`, `props`) and a final root digest composition.
2. Extend patch-apply/reducer output to emit hash-relevant delta facts in stable sorted form.
3. Thread optional accumulator updates through `_onPatchCommitted` and `_setMaterializedState`.
4. On divergence, cache miss, or migration boundaries, fall back to full `computeStateHashV5()` and re-seed accumulator.
5. Ship shadow mode first: compute both hashes and assert equality in tests and optionally in debug logs.

**Mitigations**
- Keep full-hash fallback always available and default-enabled under a kill switch.
- Scope rollout to non-audit mode first, then widen after parity confidence is proven.
- Persist no new on-disk format until parity and determinism are validated over replay fixtures.

**Defensive tests**
- Determinism property test: randomized patch order producing equivalent state yields identical incremental hash.
- Differential test: for every patch fixture, `incrementalHash === computeStateHashV5(fullState)`.
- Replay/resume test: checkpoint load + incremental updates produce same hash as cold materialize.
- Kill-switch test: disabling accumulator always forces full-hash behavior.
- Corruption test: injected accumulator mismatch triggers full recompute + warning.

### Innovation Concept I2 — Memoized Ancestry Cache Across Materialize/Sync Cycles

**Vision**
Introduce a bounded, frontier-aware ancestry memoization layer so repeated `_isAncestor()` checks within the same frontier epoch become O(1) lookups, reducing repeated DAG walks in sync and checkpoint replay flows.

**Why this matters**
B115 removes per-patch validation overhead, but ancestry checks still occur in multiple call paths and can recur under repeated sync exchanges.

**Mini battle plan**
1. Add `AncestryCache` keyed by `(writerId, ancestorSha, descendantSha, frontierFingerprint)`.
2. Wire cache lookup into `_relationToCheckpointHead` and sync divergence pre-check paths.
3. Add LRU + epoch invalidation on frontier movement.
4. Emit cache metrics (`hits`, `misses`, `evictions`) in debug observability hooks.
5. Add an emergency bypass option to disable cache for diagnostics.

**Mitigations**
- Tie cache validity to frontier fingerprint to prevent stale ancestry answers.
- Never cache errors from storage-layer failures.
- Use strict memory cap and eviction policy to avoid unbounded growth.

**Defensive tests**
- Correctness test: cached answers match uncached `_isAncestor()` over randomized chains/forks.
- Invalidation test: frontier update invalidates stale entries.
- Stress test: large writer set with churn remains within configured memory bounds.
- Failure-path test: transient `getNodeInfo` errors do not poison cache.

### Innovation Concept I3 — Audit-Mode Diff Synthesis

**Vision**
Retain audit receipts and still unlock incremental index updates by synthesizing `PatchDiff` from applied outcomes when audit mode is enabled.

**Why this matters**
Current audit path uses `diff: null`, which is safe but forfeits B114 hot-path gains for audit-enabled deployments.

**Mini battle plan**
1. Define a deterministic adapter from receipt outcomes to `PatchDiff` (or a subset sufficient for index updates).
2. Implement `applyWithReceiptAndDiff` or companion translator utility.
3. Gate rollout behind an audit-performance flag.
4. Validate parity by comparing synthesized diff effects against full rebuild results.
5. Expand to default-on after burn-in.

**Mitigations**
- If translation ambiguity exists, fall back to `diff: null` for that patch.
- Keep audit commit semantics unchanged; performance optimization must be side-effect free.
- Add structured warning when synthesis is skipped.

**Defensive tests**
- Equivalence test: audit-mode synthesized diff path produces identical logical index/query answers as full rebuild.
- Partial-diff fallback test: unsupported receipt shapes trigger safe full rebuild.
- Regression test: audit receipt persistence remains byte-for-byte compatible.

### Innovation Concept I4 — Performance Budget Guardrails in CI

**Vision**
Turn hot-path performance expectations into enforceable, trend-aware CI checks to prevent accidental regressions in materialize, eager commit, and ancestry validation.

**Why this matters**
Performance fixes are vulnerable to silent regressions without explicit budgets and telemetry snapshots.

**Mini battle plan**
1. Add benchmark harness with stable fixture generator and repeat-run median reporting.
2. Capture baseline medians in repository-managed budget files.
3. Add CI job that flags regressions above tolerance thresholds.
4. Add local dev command to run quick smoke benchmarks before push.
5. Publish historical trend artifact per PR for review.

**Mitigations**
- Use percentile/median thresholds to reduce flakiness.
- Separate noisy micro-benchmarks from deterministic scenario benchmarks.
- Allow explicit, reviewed budget updates when justified.

**Defensive tests**
- Harness self-test: fixture generation is deterministic.
- Budget parser test: malformed budget files fail loudly.
- CI integration test: intentional slowdown fixture triggers regression failure.

### Innovation Concept I5 — `warp doctor` Integrity and Performance Diagnostics

**Vision**
Provide a first-class diagnostics command that reports health and readiness: frontier consistency, checkpoint integrity, index staleness, ancestry anomalies, and GC/checkpoint recommendations.

**Why this matters**
Operators need fast, explainable diagnosis before data repair, performance tuning, or migration decisions.

**Mini battle plan**
1. Define command contract and structured output schema (`--json` + human mode).
2. Implement read-only checks for refs/frontier/checkpoint/index shard metadata.
3. Add actionable recommendations with explicit confidence levels.
4. Add remediation pointers (`runGC`, `createCheckpoint`, `materialize`) without mutating by default.
5. Add machine-consumable exit codes for CI/preflight integration.

**Mitigations**
- Keep default mode non-destructive.
- Mark uncertain checks as warnings, not hard failures.
- Include command runtime budget to avoid pathological scans by default.

**Defensive tests**
- Golden-output tests for both human and JSON modes.
- Corruption fixture tests (missing blobs, mismatched shard frontier) emit expected findings.
- Exit-code contract tests for clean/warn/fail states.

### Innovation Concept I6 — Frontier-Aware Query Result Cache

**Vision**
Cache expensive read/query results keyed by frontier fingerprint + query signature + observer projection, with strict invalidation rules to preserve correctness.

**Why this matters**
Read-heavy workloads repeatedly recompute equivalent traversals even when frontier is unchanged.

**Mini battle plan**
1. Introduce cache interface and canonical query signature generation.
2. Bind cache entries to frontier fingerprint and observer config hash.
3. Integrate with query builder execution path as optional optimization layer.
4. Add metrics and hit-rate instrumentation.
5. Roll out to specific query families first (neighbors/path/property-heavy).

**Mitigations**
- Hard invalidate on any frontier movement.
- Include projection/redaction config in key to avoid cross-view leakage.
- Cap memory and provide TTL plus LRU eviction.

**Defensive tests**
- Correctness test: cached and uncached query outputs match across varied projections.
- Invalidation test: commit advances frontier and invalidates stale entries.
- Isolation test: different observer configs never share cached results.
- Memory test: eviction policy bounds retained entries.

### Concern Hardening C1 — Schema 4 Checkpoint Ancestry Validation Gap

**Concern**
`_validatePatchAgainstCheckpoint()` currently gates only schema 2/3 checkpoints, while schema 4 checkpoints are used in replay paths. This can unintentionally bypass ancestry validation for schema 4.

**Mitigation vision**
Unify checkpoint ancestry semantics across all active checkpoint schema versions (2/3/4), with explicit compatibility handling for future versions.

**Mini battle plan**
1. Update `_validatePatchAgainstCheckpoint` gate to include schema 4.
2. Add explicit comment and helper (`isCheckpointSchemaWithFrontier`) to avoid future drift.
3. Add coverage for schema 4 acceptance/rejection branches.
4. Add one migration-compatibility test to ensure schema 2/3 behavior remains unchanged.

**Defensive tests**
- Schema 4 `ahead` case passes.
- Schema 4 `same` and `behind` cases reject with backfill error.
- Schema 4 `diverged` case rejects with fork error.
- Mixed-schema replay fixture verifies no behavior regression.

### Concern Hardening C2 — Remaining Full-Hash Hot Path Cost

**Concern**
Even with diff-aware view updates, `_setMaterializedState()` computes canonical state hash from full state each call, preserving O(V+E+P) work on eager writes.

**Mitigation vision**
Stage incremental hash support with strict parity checks and safe rollback to full recomputation.

**Mini battle plan**
1. Instrument and log current hash cost distribution under representative fixtures.
2. Land incremental hash accumulator behind feature flag.
3. Run shadow parity in CI and local stress tests.
4. Flip default only after parity and performance gates hold across multiple releases.

**Defensive tests**
- Benchmark regression tests around hash-heavy workloads.
- Differential hash parity tests across random patch streams.
- Feature-flag toggling tests proving behavior equivalence.

### Concern Hardening C3 — Tip-Only Validation Assumes Chain Integrity

**Concern**
B115 validates ancestry once at writer tip. This is valid under linear chain assumptions, but chain-order integrity should be asserted defensively to catch storage anomalies/corruption.

**Mitigation vision**
Preserve tip-only performance while adding optional integrity assertions that verify contiguous parent linkage for loaded writer patch ranges.

**Mini battle plan**
1. Add optional integrity checker (`assertContiguousWriterChain`) for debug/preflight modes.
2. Run integrity assertion in targeted contexts: checkpoint replay and `warp doctor`.
3. Decide runtime default: off in hot path, on in diagnostics/CI corruption suites.
4. Emit actionable diagnostics when chain discontinuity is detected.

**Defensive tests**
- Positive chain test: contiguous range passes with zero warnings.
- Discontinuity test: injected parent mismatch throws/flags deterministic error.
- Missing commit metadata test: checker fails closed with explicit reason.
- Performance test: integrity checker remains disabled in default hot path.

### Suggested Sequencing (If Promoted)

1. Start with concern hardening C1 (low effort, high correctness leverage).
2. Implement I4 (performance guardrails) before deeper performance refactors.
3. Land I2 ancestry cache and C3 integrity diagnostics in parallel tracks.
4. Proceed with I1 incremental hash and then I3 audit diff synthesis.
5. Add I5 (`warp doctor`) and I6 query caching once observability and guardrails are in place.

---

## Horizon Appendix — Post-Cooldown Concept + Concern Pack (2026-02-27)

This appendix is intentionally additive and non-disruptive to current milestone accounting.
These entries are drafted as fully-fleshed candidates for prioritization after review cooldown.

### Concept Vision Pack

#### H1 — Time-Travel Delta Engine (`warp diff --ceiling A --ceiling B`)

**Vision:**
Turn seek/materialize ceilings into a first-class forensic primitive. Users should be able to ask, "what changed between causal horizons A and B?" and get deterministic node/edge/property deltas, optional provenance attribution, and machine-readable output for automation.

**Mini battle plan:**
1. Contract phase:
- Define CLI UX: `warp diff --ceiling <a> --ceiling <b> [--json|--ndjson] [--summary|--full]`.
- Define output schema: `{addedNodes, removedNodes, addedEdges, removedEdges, changedProps}` with stable ordering.
- Define ceiling semantics for edge cases: `A==B`, `A=0`, missing writers, pinned frontiers.
2. MVP phase:
- Reuse existing materialization path with two state snapshots and deterministic diffing.
- Add fast path for `A==B` and zero delta.
- Return compact summary by default; full payload via explicit flag.
3. Hardening phase:
- Integrate optional provenance slices (`--with-provenance`) for changed items.
- Add guardrails for large output (`--max-items`, truncation marker).
- Add performance budget checks in CI for medium-sized graphs.

**Defensive tests:**
- Property test: `diff(A, A)` is always empty.
- Consistency test: `apply(diff(A,B), stateA) == stateB` for supported operations.
- Determinism test: repeated diff calls produce byte-identical JSON after canonical sort.
- Multi-writer edge test: concurrent add/remove/prop updates respect CRDT semantics.

**Primary risks:**
- Memory pressure from dual-state materialization on large graphs.
- User confusion between structural and semantic/provenance diff modes.

---

#### H2 — Trust-Aware Query Mode

**Vision:**
Make trust policy operational at query time, not just verification time. Users can choose whether traversal/query results include all data, only trusted-writer data, or annotated data with trust confidence.

**Mini battle plan:**
1. Contract phase:
- Define modes: `--trust-mode off|annotate|enforce`.
- Define filtering semantics: writer-level inclusion/exclusion and fallback behavior when trust is degraded.
- Define payload shape for annotations (`writerId`, `trustStatus`, `reasonCode`).
2. MVP phase:
- Evaluate trust once per query request, cache per-request assessment.
- Apply writer-based filtering in traversal/query result assembly.
- Emit warnings when mode is `annotate` and untrusted contributors are present.
3. Hardening phase:
- Add explicit degraded state handling (`trust chain unreadable` != `not configured`).
- Add policy knobs for mixed-trust graphs.
- Add metrics for trust-filter impact (dropped results, affected subgraphs).

**Defensive tests:**
- Contract tests for each mode and failure state (configured, not_configured, degraded/error).
- Regression tests ensuring `off` mode behavior matches current baseline exactly.
- Security test: enforce mode must never leak untrusted-writer artifacts.
- Snapshot tests for annotated output payload.

**Primary risks:**
- Breaking user expectations if implicit filtering occurs without clear diagnostics.
- Increased latency if trust evaluation repeats unnecessarily.

---

#### H3 — Provenance Heatmap + Causal Cone Visualizer

**Vision:**
Provide immediate intuition about write hotspots and causal dependency depth. Given a target node/edge/property, render a causal cone and highlight churn intensity to support debugging, incident response, and evolution analysis.

**Mini battle plan:**
1. Contract phase:
- Define API/CLI: `warp provenance heatmap`, `warp provenance cone --target ...`.
- Define visualization payload schema (nodes, edges, weights, timestamps).
- Define deterministic layout seed handling for reproducible diagrams.
2. MVP phase:
- Use existing provenance index to compute cone and patch frequency.
- Export JSON + optional Mermaid/HTML render.
- Provide summary stats: depth, fan-in, high-churn nodes.
3. Hardening phase:
- Add sampling for very large cones.
- Add filters by writer/time range/operation type.
- Add "explain this value" one-shot workflow for support/debug.

**Defensive tests:**
- Cone correctness tests against hand-built miniature patch histories.
- Stability tests: same input and seed yields same output ordering/layout hints.
- Performance tests on synthetic high-fan-in graphs.
- Fuzz tests for malformed target identifiers.

**Primary risks:**
- Large cone explosion without sampling limits.
- Visualization layer becoming a maintenance burden if tightly coupled to core.

---

#### H4 — Checkpoint Policy Advisor

**Vision:**
Shift checkpoint tuning from guesswork to measured policy recommendations. Advisor inspects patch cadence, materialize timings, and cache behavior to propose `checkpointPolicy.every` and optional GC cadence.

**Mini battle plan:**
1. Contract phase:
- Define advisor command: `warp checkpoint advise [--window <n>]`.
- Define output: recommended policy, confidence, expected gains, tradeoffs.
- Define telemetry inputs and privacy boundaries.
2. MVP phase:
- Collect/aggregate core signals already emitted by timing/logger paths.
- Compute heuristic recommendation bands (conservative/balanced/aggressive).
- Expose dry-run simulation: "what if policy X?".
3. Hardening phase:
- Add workload profiles (read-heavy, write-heavy, mixed).
- Add guardrails to avoid over-checkpointing thrash.
- Store policy-change audit trail.

**Defensive tests:**
- Scenario tests with synthetic workloads and expected recommendation ranges.
- Regression tests: no recommendation when evidence quality is low.
- Safety tests: advisor never suggests invalid/degenerate values.
- Determinism tests for same telemetry window.

**Primary risks:**
- Overfitting heuristics to narrow workload assumptions.
- Recommendation trust erosion if confidence scoring is opaque.

---

#### H5 — Conflict Simulator Mode

**Vision:**
Provide a deterministic sandbox for modeling concurrent writer behavior before production rollout. Teams can simulate interleavings, inspect receipts/conflicts, and validate convergence guarantees under stress.

**Mini battle plan:**
1. Contract phase:
- Define scenario format (`writers`, `ops`, `interleavings`, `seed`).
- Define outputs: final state hash, per-op receipts, conflict report.
- Define replay compatibility with real patch format.
2. MVP phase:
- Build runner that executes scenarios through existing reducer semantics.
- Add deterministic seed-based interleaving generator.
- Emit machine-readable artifacts for CI diffing.
3. Hardening phase:
- Add canned scenarios for known footguns.
- Add minimization helper to shrink failing scenarios.
- Add compatibility mode for historical schema versions.

**Defensive tests:**
- Convergence tests: multiple interleavings produce equivalent final state.
- Differential tests: simulator output matches live engine replay output.
- Flake resistance tests with repeated seeded runs.
- Input validation tests for malformed scenarios.

**Primary risks:**
- Divergence between simulator and real pipeline if abstractions drift.
- Misleading confidence if scenarios are too simplistic.

---

#### H6 — Offline Bundle Export/Import for Air-Gapped Sync

**Vision:**
Enable secure graph/trust transfer where network sync is unavailable. Bundle includes selected refs, trust records, integrity manifests, and optional signatures; import verifies before applying.

**Mini battle plan:**
1. Contract phase:
- Define bundle manifest format and signature envelope.
- Define CLI: `warp bundle export` / `warp bundle import --verify`.
- Define partial export scope (graph-only, trust-only, checkpoint-only).
2. MVP phase:
- Implement deterministic packing of refs + blobs + metadata.
- Implement verification pipeline (hashes, trust chain integrity, manifest schema).
- Add dry-run import report.
3. Hardening phase:
- Add chunking/streaming for large bundles.
- Add compatibility matrix across versions.
- Add replay protection and origin identity metadata.

**Defensive tests:**
- Tamper tests: modified bundle must fail verification deterministically.
- Round-trip tests: export→import yields identical frontier/state hash.
- Backward compatibility tests across supported schema versions.
- Large-bundle stress tests.

**Primary risks:**
- Security footguns in partially verified imports.
- Operational complexity for version negotiation.

---

#### H7 — Query Plan Telemetry + Explain Mode

**Vision:**
Introduce explainability for query/traversal execution: which index path was used, when fallback happened, and where time/memory were spent. Reduce "why is this slow?" debugging time.

**Mini battle plan:**
1. Contract phase:
- Define `--explain` payload for query/traverse commands.
- Define stable telemetry fields (indexUsed, fallbackReason, neighborFetchCount, cacheHits).
- Define redaction policy for sensitive IDs in logs.
2. MVP phase:
- Instrument traversal/query engine at key decision points.
- Emit explain report in JSON/NDJSON.
- Add summary in human-readable CLI output.
3. Hardening phase:
- Add per-phase timings and warning thresholds.
- Add regression benchmark gates to detect performance drift.
- Add trace correlation IDs for distributed workflows.

**Defensive tests:**
- Snapshot tests for explain payload schema stability.
- Unit tests for fallback reason classification.
- Regression tests that telemetry collection does not alter behavior.
- Overhead tests to cap instrumentation cost.

**Primary risks:**
- Telemetry overhead in hot loops.
- Schema churn breaking downstream tooling.

---

#### H8 — Kairos Timeline Command (Branch Event Geometry)

**Vision:**
Expose branch-event structure directly: fork/join timelines, writer divergence windows, and convergence points. Make Chronos (linear patch ticks) and Kairos (branch structure) both inspectable in one tool.

**Mini battle plan:**
1. Contract phase:
- Define output model for event graph: nodes (events), edges (causal/branch links), annotations.
- Define CLI: `warp timeline kairos [--from ... --to ... --format mermaid|json]`.
- Define ordering rules for stable output across runs.
2. MVP phase:
- Build event graph from writer refs + ancestry relationships.
- Render textual summary + JSON graph payload.
- Include quick metrics (fork count, max divergence depth, mean convergence latency).
3. Hardening phase:
- Add filters by writer/subgraph/time.
- Add compact mode for CI/report integration.
- Integrate with provenance cone command for cross-navigation.

**Defensive tests:**
- Determinism tests for event ordering and IDs.
- Correctness tests on synthetic fork/join histories.
- Performance tests on long multi-writer histories.
- Output parser tests for Mermaid and JSON modes.

**Primary risks:**
- Ambiguity in representing complex multi-parent histories.
- User overload if visuals are too dense by default.

---

### Concern Hardening Pack

#### C-H1 — Fragile Error-String Matching for Trust Ref Absence

**Concern:**
`readRecords()` currently infers "ref missing" by substring matching on error messages.
This is adapter-dependent and brittle under localization or message wording changes.

**Mitigation strategy:**
1. Introduce typed persistence error codes (`E_REF_NOT_FOUND`, `E_REF_IO`, etc.).
2. Update trust read path to branch on error code, not string text.
3. Keep temporary compatibility shim with explicit TODO removal milestone.

**Defensive tests:**
- Adapter contract tests that assert standardized error codes.
- Trust read tests with localized/custom error messages to verify no false classification.
- Regression tests for existing adapters to ensure old behavior remains correct until shim removal.

**Exit criteria:**
No trust-path logic depends on raw error message text for control flow.

---

#### C-H2 — Public Materialization Freeze Contract Ambiguity

**Concern:**
Top-level frozen return objects changed identity semantics. Callers may assume returned `state` is the same reference as internal cache and mutate/compare by identity.

**Mitigation strategy:**
1. Document explicit public contract: shallow-frozen wrapper, internal substructures may share references.
2. Add helper API for safe mutable clone when needed (`materializeMutable()` or utility clone call guidance).
3. Add compatibility notes in migration docs/changelog.

**Defensive tests:**
- Contract tests asserting returned state is frozen and top-level identity differs from `_cachedState`.
- Tests ensuring readonly behavior triggers mutation failures in strict mode.
- Tests proving internal cache is not corrupted by attempted public mutation.

**Exit criteria:**
No ambiguity in docs/tests around identity and mutability guarantees of public materialization APIs.

---

#### C-H3 — `CachedValue` Null-Value Semantics

**Concern:**
`_isValid()` treats `null` as "no cache," so legitimate `null` compute results never cache as valid entries.
This can cause repeated recompute churn and unexpected behavior.

**Mitigation strategy:**
1. Introduce explicit `hasComputedValue` sentinel independent from `_value` content.
2. Preserve existing API shape while allowing `null` to be cached as a valid payload.
3. Add migration note if any behavior changes for callers that used null as "absent".

**Defensive tests:**
- Test that `compute -> null` is cached within TTL and not recomputed.
- Test invalidate still clears sentinel and forces recompute.
- Test serialization/metadata paths behave correctly for null payloads.

**Exit criteria:**
Cache validity is based on cache state, not payload truthiness/value class.

---

#### C-H4 — Trust Error Payload Assembly Duplication

**Concern:**
Verifier and CLI build similar trust error payloads independently.
This creates drift risk in `source`, `reasonCode`, and response shape.

**Mitigation strategy:**
1. Extract a shared helper factory for trust error/not-configured payload builders.
2. Make source/reason semantics centralized and table-driven.
3. Add schema assertion at boundaries to prevent accidental divergence.

**Defensive tests:**
- Golden tests asserting verifier and CLI produce identical payload structure for equivalent error conditions.
- Schema conformance tests on all trust payload variants.
- Snapshot tests to detect accidental field drift.

**Exit criteria:**
Single-source trust payload composition for common states; CLI and service outputs remain shape-compatible by construction.

---

### Recommended Sequencing (when cooldown ends)

1. `C-H1` and `C-H4` first (trust correctness and consistency foundation).
2. `C-H2` next (contract/documentation hardening around materialization freeze behavior).
3. `C-H3` next (semantic cleanup of cache null handling).
4. `H1` and `H7` as first feature wave (high practical operator value with moderate implementation risk).
5. `H2` and `H5` as second feature wave (policy + simulation leverage).
6. `H3`, `H4`, `H8`, then `H6` based on bandwidth and ecosystem demand.


---
