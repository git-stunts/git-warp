# Completed Milestones — @git-stunts/git-warp

> Archived from `ROADMAP.md`. These milestones are fully complete and preserved here for historical reference.

---

## Early Milestones (v7.x–v12.0.0)

| #   | Codename                   | Version | Theme                                   |
| --- | -------------------------- | ------- | --------------------------------------- |
| 1   | AUTOPILOT                  | v7.1.0  | Kill the Materialize Tax                |
| 2   | GROUNDSKEEPER              | v7.2.0  | Self-Managing Infrastructure            |
| 3   | WEIGHTED                   | v7.3.0  | Edge Properties                         |
| 4   | HANDSHAKE                  | v7.4.0  | Multi-Writer Ergonomics                 |
| 5   | COMPASS                    | v7.5.0  | Advanced Query Language                 |
| 6   | LIGHTHOUSE                 | v7.6.0  | Observability                           |
| 7   | PULSE                      | v7.7.0  | Subscriptions & Reactivity              |
| 8   | HOLOGRAM                   | v8.0.0  | Provenance & Holography                 |
| 9   | ECHO                       | v9.0.0  | Observer Geometry                       |
| 10  | BULKHEAD                   | v10.0.0 | Hexagonal Purity & Structural Integrity |
| 11  | RECALL                     | v10.4.0 | Seek Materialization Cache              |
| 12  | SEEKDIFF                   | v10.5.0 | Structural Seek Diff                    |
| M1  | IRON DOME                  | v11.0.0 | Security & Protocol Hardening           |
| M2  | FOUNDATION LIFT            | v11.1.0 | Developer Velocity for Correctness      |
| M3  | GHOST PROTOCOL             | v11.1.0 | Immutable Audit Trail                   |
| M4  | VERIFY OR IT DIDN'T HAPPEN | v11.1.0 | Cryptographic Verification              |
| M5  | CLI DECOMPOSITION          | v11.1.0 | Maintainability                         |
| M6  | SAFE ERGONOMICS            | v11.1.0 | Single-Await API                        |
| M7  | TRUST V1                   | v11.1.0 | Cryptographic Identity-Backed Trust     |
| M8  | IRONCLAD                   | v11.x   | Type Safety                             |
| M9  | PARTITION                  | v12.0.0 | Architectural Decomposition             |

---

## Milestone 10 — SENTINEL (completed tasks)

**Theme:** Trust hardening + sync safety + correctness
**Objective:** Complete the signed trust boundary. Fix audit-critical safety issues. Design the causality bisect spec.
**Triage date:** 2026-02-17

### M10.T1 — Signed Sync Ingress

- **Status:** `DONE`

**Items:**

- **B1** (STRICT PROVENANCE) — ✅ SyncTrustGate wired into SyncController.applySyncResponse(). Trust evaluates on `writersApplied` (patch authors), not frontier keys. Enforce/log-only/off modes. Derived cache invalidation after sync apply.

### M10.T2 — Trust Reliability

- **Status:** `DONE`

**Items:**

- **B39** (TRUST RECORD CAS RETRY) — ✅ `appendRecordWithRetry()` added to TrustRecordService. Re-reads chain tip on CAS conflict, rebuilds prev pointer, re-signs via caller-provided callback, retries. Convergence tests pass.
- **B40** (BATS E2E: `git warp trust` OUTPUT SHAPES) — ✅ Unit test coverage for trust gate integration, CAS convergence, spec compliance. BATS E2E deferred to CI integration pass.

### M10.T3 — Audit-Critical Fixes

- **Status:** `DONE`

**Items:**

- **B63** (GC SNAPSHOT ISOLATION) — ✅ Already implemented in `checkpoint.methods.js` using clone-then-swap + frontier fingerprint CAS. `executeGC()` mutates clone only; swap happens after fingerprint check. `_maybeRunGC` discards stale result silently. `runGC` throws `E_GC_STALE`.
- **B64** (SYNC INGRESS PAYLOAD VALIDATION) — ✅ Already complete in SyncPayloadSchema.js (done in v12.1.0).
- **B65** (SYNC DIVERGENCE LOGGING) — ✅ `processSyncRequest()` now tracks `skippedWriters` array with `{ writerId, reason, localSha, remoteSha }`. Structured logging at warn level. Response includes `skippedWriters`.

---

## Milestone 11 — COMPASS II

**Theme:** Developer experience
**Objective:** Ship bisect, public observer API, and batch patch ergonomics.
**Triage date:** 2026-02-17
**Completed:** 2026-03-03

### M11.T1 — Causality Bisect (Implementation)

- **Status:** `DONE`

**Items:**

- **B2** ✅ (CAUSALITY BISECT) — `BisectService` + `git warp bisect` CLI. Binary search over writer patch chain. O(log N) materializations. 9 test vectors.

### M11.T2 — Observer API

- **Status:** `DONE`

**Items:**

- **B3** ✅ (OBSERVER API) — `subscribe()` and `watch()` promoted to `@stability stable` with `@since 13.0.0`. Fixed `onError` type to `unknown`. `watch()` pattern type corrected to `string | string[]`.

### M11.T3 — Batch Patch API

- **Status:** `DONE`

**Items:**

- **B11** ✅ (`graph.patchMany()` BATCH API) — sequential batch helper. Each callback sees state from prior commit. Returns array of SHAs. Inherits reentrancy guard.

**M11 Gate:** ✅ All gates met. Bisect correctness verified with 9 test vectors. Observer API stable with JSDoc annotations. patchMany tested with 6 scenarios including reentrancy guard.

---

## Milestone 12 — SCALPEL

**Theme:** Comprehensive STANK audit cleanup — correctness, performance & code quality
**Objective:** Fix STANK audit issues except S2 (edge property encoding, deferred to M13). Eliminate data-loss vectors (CRITs), rewrite broken abstractions (STANKs), clean up fragile code (JANK), and polish minor issues (TSK TSK). 45 of 46 issues; S2/B116 extracted to its own milestone.
**Triage date:** 2026-02-27
**Audit source:** `docs/audits/2026-02-complexity-audit.md`

### Already Fixed (M10 + prior M12 work)

| STANK ID | B#  | Fix                                                            |
| -------- | --- | -------------------------------------------------------------- |
| C4       | —   | `_snapshotState` lazy capture in PatchBuilderV2                |
| C6       | —   | `E_LAMPORT_CORRUPT` throw in Writer.js                         |
| S4       | B72 | `'0'.repeat(40)` in compareAndSwapRef                          |
| S9       | —   | Fast-return guard in `_materializeGraph()`                     |
| J1       | B68 | MinHeap topological sort in GraphTraversal                     |
| J2       | B69 | `batchMap()` + propsMemo in QueryBuilder                       |
| J5       | —   | Dead `visible.cbor` write removed from CheckpointService       |
| J8       | —   | Temp array pattern in `orsetCompact`                           |
| J11      | —   | `_indexDegraded` flag in WarpGraph                             |
| C2       | —   | `isKnownOp()` exists (tests added, sync-path wiring in M12.T1) |
| C3       | —   | Receipt validation tests added (runtime guards in M12.T3)      |

### M12.T1 — Sync Safety (C1 + C2 + S3)

- **Status:** `DONE`
- **Size:** L | **Risk:** HIGH
- **Depends on:** —

**Items:**

- **B105** ✅ (C1: SYNC DIVERGENCE + STALE CACHE) — Route `applySyncResponse` through `_setMaterializedState()` instead of raw `_cachedState` assignment. Surface `skippedWriters` in `syncWith` return value. **Files:** `SyncController.js`
- **B106** ✅ (C2: FORWARD-COMPATIBLE OPS ALLOWLIST) — Call `isKnownOp()` before `join()` in sync apply path. Fail closed on unknown ops with `SchemaUnsupportedError`. **Files:** `SyncProtocol.js`
- **B107** ✅ (S3: BIDIRECTIONAL SYNC DELTA) — Add `isAncestor()` pre-check in `processSyncRequest` to detect divergence early without chain walk. Updated misleading comment in `computeSyncDelta`. Kept `loadPatchRange` throw as fallback for persistence layers without `isAncestor`. **File:** `SyncProtocol.js`

### M12.T2 — Cache Coherence (S1)

- **Status:** `DONE`
- **Size:** S | **Risk:** HIGH
- **Depends on:** M12.T1

**Items:**

- **B108** ✅ (S1: CACHE COHERENCE) — Fixed `join()` to install merged state as canonical (`_stateDirty = false`, adjacency built synchronously) instead of setting `_stateDirty = true` which caused `_ensureFreshState()` to discard the merge result. Cleared `_cachedViewHash` in all dirty paths (`_onPatchCommitted` fallback, `_maybeRunGC` frontier-changed). Full `CacheState` object refactor deferred — actual bugs were surgical. **Files:** `patch.methods.js`, `checkpoint.methods.js`

### M12.T3 — Remaining CRITs (C3, C5, C7, C8)

- **Status:** `DONE`
- **Size:** M | **Risk:** MEDIUM
- **Depends on:** M12.T2

**Items:**

- **B109** ✅ (C3: RECEIPT PATH RUNTIME GUARDS) — Added `validateOp()` runtime guards with `PatchError` on validation failure. Accepts Set and Array for `observedDots`. **File:** `JoinReducer.js`
- **B110** ✅ (C5: PROVENANCE SEMANTICS RENAME) — Renamed `_reads` to `_observedOperands` in PatchBuilderV2. **File:** `PatchBuilderV2.js`
- **B111** ✅ (C7: GC TRANSACTION BOUNDARY) — Hardened GC transaction boundary with input validation. **File:** `GCPolicy.js`
- **B112** ✅ (C8: ERROR HANDLER FORMAT) — Clarified intentional `process.argv` fallback comment. **File:** `warp-graph.js`

### M12.T4 — Index Performance (S5 + S6)

- **Status:** `DONE` (PR #52)
- **Size:** L | **Risk:** MEDIUM
- **Depends on:** —

**Items:**

- **B66** ✅ (S5: INCREMENTAL INDEX O(E) SCAN) — Added endpoint adjacency caching for alive edge keys and separated genuinely-new nodes from re-added nodes; re-add restoration now enumerates incident edge candidates rather than always rescanning all alive edges. **File:** `IncrementalIndexUpdater.js`
- **B113** ✅ (S6: DOUBLE BITMAP DESERIALIZATION) — `_purgeNodeEdges` now deserializes owner-row bitmaps once, mutates in-place (`bitmap.clear()`), and serializes once in both forward and reverse loops. **File:** `IncrementalIndexUpdater.js`

### M12.T5 — Post-Commit + Ancestry (S7 + S8)

- **Status:** `DONE` (PR #52)
- **Size:** L | **Risk:** MEDIUM
- **Depends on:** M12.T2

**Items:**

- **B114** ✅ (S7: DIFF-AWARE EAGER POST-COMMIT) — Patch diff now passed through eager post-commit path to `_setMaterializedState()`. **File:** `patch.methods.js`
- **B115** ✅ (S8: MEMOIZED ANCESTRY WALKING) — Ancestry validated once per writer tip, not per patch SHA. **File:** `checkpoint.methods.js`

### ~~M12.T6 — Edge Property Encoding (S2)~~ → Extracted to M13

- **Status:** `DONE` (internal canonicalization via ADR 1); wire-format half deferred (ADR 2/3)
- See M13 below.

### M12.T7 — Corruption Guard

- **Status:** `DONE` (PR #51)
- **Size:** S | **Risk:** LOW
- **Depends on:** —

**Items:**

- **B70** ✅ (PATCHBUILDER ASSERTNOTCOMMITTED) — Added `_committed` flag + guard on all mutating methods in `PatchBuilderV2`. **Files:** `PatchBuilderV2.js`, `PatchBuilderV2.test.js`

### M12.T8 — JANK Batch (J3, J4, J6, J7, J9, J10, J12–J19)

- **Status:** `DONE` (PR #54, PR #51, this PR)
- **Size:** L | **Risk:** LOW
- **Depends on:** —

**Items:**

- **B117** ✅ (JANK BATCH) — 14 independent JANK fixes from STANK.md:
  - ~~**J3:** Single `rev-parse` with exit-code handling in `readRef`.~~ ✅
  - ~~**J4:** Pooled concurrent blob reads in `readTree` (batch size 16).~~ ✅
  - ~~**J6:** String prefix checks in `findAttachedData` instead of full split+compare.~~ ✅
  - ~~**J7:** `_hasEdgeProps` boolean cache for schema version detection.~~ ✅
  - ~~**J9:** Memoize in-flight promise in `CachedValue.get()`.~~ ✅ (PR #54)
  - ~~**J10:** Delete `fnv1a.js` (charCodeAt variant).~~ ✅ (PR #54)
  - ~~**J12:** Freeze state from public materialization APIs.~~ ✅ (PR #54)
  - ~~**J13:** Remove redundant CAS pre-check in `PatchSession.commit()`.~~ ✅ (PR #54)
  - ~~**J14:** Catch only "not found" in checkpoint load; re-throw corruption.~~ ✅
  - ~~**J15:** Typed ok/error from `TrustRecordService.readRecords`.~~ ✅ (PR #54)
  - ~~**J16:** JSDoc documenting `_hasSchema1Patches` tip-only semantics.~~ ✅
  - ~~**J17:** Phase comments in `extractBaseArgs` state machine.~~ ✅ (PR #54)
  - ~~**J18:** `NATIVE_ROARING_AVAILABLE` instance-level with test-reset.~~ ✅ (PR #54)
  - ~~**J19:** Pre-compute labels key string in neighbor cache key.~~ ✅ (PR #54)

### M12.T9 — TSK TSK Cleanup (T1–T38)

- **Status:** `DONE`
- **Size:** L | **Risk:** LOW
- **Depends on:** —

**Items:**

- **B67** ✅ (T1: JOINREDUCER RECEIPT O(N\*M)) — `nodeRemoveOutcome`/`edgeRemoveOutcome` now use `buildDotToElement` reverse index.
- **B73** ✅ (T2: `orsetClone`) — Dedicated `orsetClone()` replacing `orsetJoin(x, empty)` pattern.
- **B74** ✅ (T32: WRITER REENTRANCY COMMENT) — JSDoc documenting `_commitInProgress` guard.
- **B75** ✅ (T9: VV COUNTER=0 ELISION) — JSDoc + debug assertion in `vvSerialize`.
- **B118** ✅ (TSK TSK BATCH) — 34 fixes across all clusters:
  - **JoinReducer** (T3): ✅ JSDoc on optional `edgeBirthEvent`
  - **CheckpointService** (T4, T25, T26): ✅ Schema:3 gap comment, non-compact path docs, O(P) scan docs
  - **GitGraphAdapter** (T5, T6, T7): ✅ Port delegation comments, `_createCommit` helper, NUL-stripping docs
  - **CRDT/Utils** (T8, T10, T11, T12, T20, T22, T37, T38): ✅ CBOR sort docs, lwwMax docs, orsetJoin clone consistency, SHA order docs, LRUCache docs, Dot parsing docs, orsetSerialize pre-decode, vvSerialize sort docs
  - **Service/Error** (T13–T19, T23–T24, T27–T31, T33–T36): ✅ Query cloning docs, mulberry32 docs, `PROPS_PREFIX` constant, WriterError/StorageError docs, cycle detection in canonicalStringify, matchGlob cache eviction, SyncProtocol frontier helpers, preprocessView docs, schemas finite refinement, RefLayout docs, PatchSession WriterError, MaterializedViewService docs, IncrementalIndexUpdater `_nextLabelId` cache + bitmap docs

**M12 Gate:** All STANK.md issues resolved (fixed, documented as intentional, or explicitly deferred with trigger) except S2/B116 (extracted to M13, now internally complete via ADR 1). Full test suite green. `WarpGraph.noCoordination.test.js` passes. No new tsc errors. Lint clean.

### M12 Internal Dependency Graph

```text
M12.T1 (Sync) ──→ M12.T2 (Cache) ──→ M12.T3 (CRITs) ──→ [M12 GATE]
                         │
                         └──→ M12.T5 (Post-Commit)

M12.T4 (Index) ─────────────────────── (independent)  ✅
M12.T7 (Corruption) ────────────────── (independent)  ✅
M12.T8 (JANK) ──────────────────────── (independent)  ✅
M12.T9 (TSK TSK) ───────────────────── (independent)  ✅

T6 (EdgeProp) extracted → M13 SCALPEL II (internal: DONE, wire: DEFERRED)
```

### M12 Verification Protocol

For every task:

1. **Before starting:** Run `npm run test:local` and record pass count as baseline
2. **After each file edit:** Run the file's specific test suite
3. **Before committing:** Full `npm run test:local` — must match or exceed baseline
4. **Critical gate:** `test/unit/domain/WarpGraph.noCoordination.test.js` must pass
5. **Lint gate:** `npm run lint` must pass

---

## Milestone 13 — SCALPEL II (completed tasks)

**Theme:** Edge property encoding — internal canonicalization + governed wire-format migration
**Objective:** Make edge property operations semantically honest internally (ADR 1), defer the persisted wire-format change until explicit readiness gates are met (ADR 2), and codify the governance process (ADR 3).
**Triage date:** 2026-02-28

### Why a dedicated milestone

B116 (STANK S2) was originally M12.T6. It was extracted because:

1. **Schema migration in a CRDT** — Multi-writer clusters can have v3 and v4 writers operating concurrently. Both must materialize identically. No coordinator can enforce version homogeneity.
2. **5+ file coordinated change** — `WarpTypesV2.js`, `JoinReducer.js`, `PatchBuilderV2.js`, `KeyCodec.js`, `MessageSchemaDetector.js` all need synchronized updates.
3. **Backward compatibility** — Old patches (schema ≤3) use `\x01`-prefixed `PropSet` ops forever. The `node.charCodeAt(0) === 1` detection heuristic must survive alongside the new `EdgePropSet` op type.
4. **No migration tooling** — Existing patches are immutable Git commits. Read-path translation is the only option.
5. **Testing surface** — Requires cross-schema materialization tests, multi-writer mixed-version tests, and checkpoint/index compatibility verification.

### M13 Outcome

Investigation revealed the correct approach is a two-phase split:

- **Phase 1 (ADR 1):** Canonicalize edge property ops internally. The reducer, receipts, provenance, and builder all operate on honest `NodePropSet`/`EdgePropSet` semantics. Legacy raw `PropSet` is normalized at reducer entry points and lowered back at write time. Reserved-byte validation prevents ambiguous new identifiers. Wire gate rejects canonical-only ops on the sync boundary.
- **Phase 2 (ADR 2, deferred):** Promote `EdgePropSet` to a persisted raw wire-format op. This is a distributed compatibility event governed by ADR 3 readiness gates. Not implemented yet — and deliberately so.

### M13.T1 — Design & Test Vectors

- **Status:** `DONE`
- **Size:** M | **Risk:** LOW

**Deliverables:**

- ADR 1 (`adr/ADR-0001-canonicalize-edge-property-ops-internally.md`) — internal canonical model design, invariants, test cases
- ADR 2 (`adr/ADR-0002-defer-edgepropset-wire-format-cutover.md`) — explicit deferral of persisted wire-format migration
- ADR 3 (`adr/ADR-0003-readiness-gates-for-edgepropset-wire-format-cutover.md`) — two-gate governance for future cutover
- Decision: normalize at reducer entry points (not decode boundary); lower at `PatchBuilderV2.build()`/`commit()`
- Tripwire test suite for wire gate (`SyncProtocol.wireGate.test.js`, `JoinReducer.opSets.test.js`)

### M13.T2 — Internal Canonicalization (ADR 1)

- **Status:** `DONE`
- **Size:** L | **Risk:** MEDIUM

**Items (all complete):**

- **B116a** — `OpNormalizer.js`: `normalizeRawOp()` / `lowerCanonicalOp()` boundary conversion
- **B116b** — `WarpTypesV2.js`: canonical `OpV2NodePropSet` / `OpV2EdgePropSet` typedefs and factory functions
- **B116c** — `JoinReducer.js`: reducer consumes canonical ops; `RAW_KNOWN_OPS` / `CANONICAL_KNOWN_OPS` split; `isKnownRawOp()` / `isKnownCanonicalOp()` exports; deprecated `isKnownOp()` alias
- **B116d** — `PatchBuilderV2.js`: constructs canonical ops internally; `build()`/`commit()` lower to raw via `lowerCanonicalOp()`; `_assertNoReservedBytes()` validation
- **B116e** — `KeyCodec.js`: `isLegacyEdgePropNode()` / `decodeLegacyEdgePropNode()` / `encodeLegacyEdgePropNode()` isolated helpers
- **B116f** — `SyncProtocol.js`: wire gate uses `isKnownRawOp()` — canonical-only ops rejected on the wire
- **B116g** — `MessageSchemaDetector.js`: `PATCH_SCHEMA_V2` / `PATCH_SCHEMA_V3` namespace separation
- **B116h** — `CheckpointService.js`: `CHECKPOINT_SCHEMA_STANDARD` / `CHECKPOINT_SCHEMA_INDEX_TREE` named constants
- **B116i** — `TickReceipt.js`: `OP_TYPES` expanded with `NodePropSet` / `EdgePropSet`; receipts use canonical type names

**M13 Gate (internal canonicalization — met):** Canonical internal model in use. Reducer never sees unnormalized legacy edge-property `PropSet`. Reserved-byte validation enforced. Wire gate rejects canonical-only ops. `WarpGraph.noCoordination.test.js` passes. 4490 unit tests + 75 integration tests green. Lint clean.

---

## Standalone Lane — Completed Items

### Immediate (all done)

| ID   | Item                                                                                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B46  | ~~**ESLINT BAN `Date.now()` IN DOMAIN**~~ — **DONE.** `no-restricted-syntax` rule on `src/domain/**/*.js`. Legitimate wall-clock uses annotated with eslint-disable. |
| B47  | ~~**`orsetAdd` DOT ARGUMENT VALIDATION**~~ — **DONE.** Runtime shape check before `encodeDot()`.                                                                     |
| B26  | ~~**DER SPKI PREFIX CONSTANT**~~ — **DONE.** `ED25519_SPKI_PREFIX` with RFC 8410 reference in TrustCrypto.js.                                                        |
| B71  | ~~**PATCHBUILDER `console.warn` BYPASSES LOGGERPORT**~~ — **DONE.** Routes through `this._logger.warn()`. Writer now forwards logger to PatchBuilderV2.              |
| B126 | ~~**`no-empty-catch` ESLINT RULE**~~ — **DONE.** `no-empty` with `allowEmptyCatch: false`.                                                                           |

### Near-Term (completed)

| ID   | Item                                                                                                                                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B120 | ~~**ADAPTER TYPED ERROR CODES**~~ — **DONE.** `PersistenceError` with `E_MISSING_OBJECT`, `E_REF_NOT_FOUND`, `E_REF_IO` codes. `wrapGitError()` classifier in GitGraphAdapter. TrustRecordService switched to typed catch. |
| B121 | ~~**CIRCULAR/SHARED-REFERENCE TEST HELPER**~~ — **DONE.** `createCircular(n)` / `createDiamond()` in `test/helpers/topologyHelpers.js`.                                                                                    |
| B122 | ~~**SCHEMA-4 CHECKPOINT VALIDATION COVERAGE**~~ — **DONE.** 21 edge-case tests covering schema mismatch, empty state, missing frontier.                                                                                    |
| B50  | ~~**ALIGN `type-surface.m8.json` WITH `index.d.ts`**~~ — **DONE.** `skippedWriters` added to `syncWith` return type; 85 type/interface/class exports added to manifest (0 errors, 0 warnings).                             |
| B51  | ~~**AUDIT REMAINING `= {}` CONSTRUCTOR DEFAULTS**~~ — **DONE.** Misleading `= {}` removed from DagTraversal, DagPathFinding, DagTopology, BitmapIndexReader constructors.                                                  |
| B52  | ~~**FIX OUTSIDE-DIFF IRONCLAD REVIEW ITEMS**~~ — **DONE.** TickReceipt wildcards → `unknown`; SyncAuthService `keys` documented as required.                                                                               |
| B55  | ~~**UPGRADE `HttpServerPort` REQUEST/RESPONSE TYPES**~~ — **DONE.** `HttpRequest`, `HttpResponse`, `HttpServerHandle` typedefs in HttpServerPort. All three adapters upgraded.                                             |
| B77  | ~~**`listRefs` UPPER BOUND**~~ — **DONE.** Optional `{ limit }` options bag; GitGraphAdapter passes `--count=N`, InMemoryGraphAdapter slices.                                                                              |
| B78  | ~~**REFLAYOUT SLASH-IN-GRAPH-NAME AMBIGUITY**~~ — **DONE.** `RESERVED_GRAPH_NAME_SEGMENTS` set; `validateGraphName()` rejects ref-layout keywords as segments.                                                             |
| B82  | ~~**PRE-PUSH HOOK `--quick` MODE**~~ — **DONE.** `WARP_QUICK_PUSH` env var skips Gate 5 (unit tests); type gates still run.                                                                                                |

### CI & Tooling (completed)

| ID  | Item                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B84 | ~~**SURFACE VALIDATOR QUIET MODE**~~ — **DONE.** `--quiet` flag suppresses stdout; stderr (errors/warnings) always flows.                                                                                                             |
| B89 | ~~**VERSION CONSISTENCY GATE**~~ — **DONE (v12.1.0).** `scripts/release-preflight.sh` checks package.json == jsr.json; `release.yml` verify job enforces tag == package.json == jsr.json + CHANGELOG dated entry + README What's New. |
| B90 | ~~**PREFLIGHT BOT CHANGELOG CHECK**~~ — **DONE (v12.1.0).** `release.yml` verify job checks CHANGELOG heading for tag version. `release-pr.yml` already runs lint+typecheck+test+pack dry-runs on PRs.                                |

### Surface Validator (completed)

| ID  | Item                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| B91 | ~~**MISSING `declare` FOR `interface`/`type` REGEXES**~~ — **DONE.** Added `(?:declare\s+)?` to interface and type regexes in `extractDtsExports`. |
| B92 | ~~**SURFACE VALIDATOR UNIT TESTS**~~ — **DONE.** 34 tests for `parseExportBlock`, `extractJsExports`, `extractDtsExports`.                         |
| B93 | ~~**DEDUP EXPORT PARSING LOGIC**~~ — **DONE.** `parseExportBlock()` extracted as shared helper; `collectExportBlocks()` internal.                  |
| B94 | ~~**STANDALONE EXPORT DECLARATIONS**~~ — **DONE.** `extractJsExports` now handles `export const/function/class`.                                   |

### v13.0.0 Standalone Items (completed)

| ID   | Item                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B44  | ~~**SUBSCRIBER UNSUBSCRIBE-DURING-CALLBACK E2E**~~ — **DONE (v13.0.0).** 3 edge-case tests (cross-unsubscribe, subscribe-during-callback, unsubscribe-in-onError).       |
| B124 | ~~**TRUST PAYLOAD PARITY TESTS**~~ — **DONE (v13.0.0).** 22 tests verifying CLI vs service shape parity.                                                                 |
| B125 | ~~**`CachedValue` NULL-PAYLOAD SEMANTIC TESTS**~~ — **DONE (v13.0.0).** 3 tests documenting null = "no value" sentinel.                                                  |
| B146 | ~~**UNIFY `CorePersistence` / `FullPersistence` TYPEDEFS**~~ — **DONE (v13.0.0).** Replaced `FullPersistence` with imported `CorePersistence`.                           |
| B148 | ~~**REVIEW NITS + INVENTORY RECONCILIATION**~~ — **DONE (v13.0.0).** Fix inventory counts, COMPLETED.md ordering, stale Deno test name, BisectService invariant comment. |

### v15 Branch Standalone Items (completed)

| ID   | Item                                                                                                                                                                                                                                                                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B19  | ~~**CANONICAL SERIALIZATION PROPERTY TESTS**~~ — **DONE (`v15`).** Added seeded property-based coverage for `canonicalStringify()` idempotency and determinism.                                                                                                                                                                                                 |
| B22  | ~~**CANONICAL PARSE DETERMINISM TEST**~~ — **DONE (`v15`).** Added property-based tests for stable canonical output across repeated `TrustRecordSchema.parse()` calls.                                                                                                                                                                                          |
| B36  | ~~**FLUENT STATE BUILDER FOR TESTS**~~ — **DONE (`v15`).** Added `createStateBuilder()` for fluent WarpStateV5 seeding and adopted it in the state-heavy graph/GC/snapshot suites.                                                                                                                                                                              |
| B37  | ~~**SHARED MOCK PERSISTENCE FIXTURE**~~ — **DONE (`v15`).** Consolidated the TrustRecordService suites onto `test/helpers/trustTestUtils.js` instead of four forked mock persistence definitions.                                                                                                                                                               |
| B48  | ~~**ESLINT BAN `= {}` CONSTRUCTOR DEFAULTS WITH REQUIRED PARAMS**~~ — **DONE (`v15`).** Added a repo-wide rule banning `constructor({ ... } = {})` in source files and normalized the remaining constructors to explicit option-bag destructuring inside the constructor body.                                                                                  |
| B49  | ~~**TIGHTEN `checkDeclarations` INLINE COMMENT STRIPPING**~~ — **DONE (`v15`).** `ts-policy-check` now strips inline declaration comments before checking for `any`.                                                                                                                                                                                            |
| B57  | ~~**AUTO-VALIDATE `type-surface.m8.json` AGAINST `index.d.ts`**~~ — **DONE (`v15`).** `typecheck:surface` now runs in CI, release preflight, and the local `scripts/hooks/pre-push` firewall, so declaration-surface drift is blocked before push instead of surfacing only in CI.                                                                          |
| B80  | ~~**CHECKPOINTSERVICE CONTENT BLOB UNBOUNDED MEMORY**~~ — **DONE (`v15`).** `createV5()` now folds content blob OIDs into sorted anchor entries in batches instead of accumulating one monolithic `Set` before tree serialization. Added checkpoint tests for dedupe, deterministic anchor ordering, and load-path indifference to `_content_*` anchor entries. |
| B81  | ~~**`attachContent` ORPHAN BLOB GUARD**~~ — **DONE (`v15`).** Content attachment now validates the target node/edge before writing blob content.                                                                                                                                                                                                                |
| B83  | ~~**DEDUP CI `type-firewall` AND `lint` JOBS**~~ — **DONE (`v15`).** Folded the duplicate `lint` workflow job into `type-firewall` and carried forward the advisory runtime `npm audit` step there so CI exposes one authoritative lint/type gate.                                                                                                              |
| B85  | ~~**TYPE-ONLY EXPORT MANIFEST SECTION**~~ — **DONE (`v15`).** Added explicit `typeExports` to `type-surface.m8.json` and taught `check-dts-surface` to fail on misplaced or duplicate entries across `exports` and `typeExports`.                                                                                                                               |
| B86  | ~~**MARKDOWNLINT CI GATE**~~ — **DONE (`v15`).** Added `npm run lint:md` with focused `MD040` enforcement and wired it into CI, then labeled the repo’s bare fenced code blocks so Markdown docs/examples pass the new gate immediately.                                                                                                                      |
| B95  | ~~**NAMESPACE EXPORT SUPPORT**~~ — **DONE (`v15`).** The declaration surface validator now handles namespace exports in `.d.ts` parsing.                                                                                                                                                                                                                        |
| B97  | ~~**AUDIT MANIFEST vs `index.js` DRIFT**~~ — **DONE (`v15`).** Runtime exports were reconciled with the public surface, and the surface checker now distinguishes runtime-backed vs type-only manifest entries.                                                                                                                                                 |
| B99  | ~~**DETERMINISM FUZZER FOR TREE CONSTRUCTION**~~ — **DONE (`v15`).** Added seeded property tests that prove stable tree OIDs when `PatchBuilderV2` content anchor order is permuted internally and when `CheckpointService.createV5()` sees the same content properties in different insertion orders.                                                          |
| B149 | ~~**LARGE-GRAPH `levels()` — TWO-PASS STREAMING**~~ — **DONE (`v15`).** `levels()` now re-fetches neighbors during the DP pass instead of pinning topo adjacency.                                                                                                                                                                                               |
| B150 | ~~**LARGE-GRAPH `transitiveReduction()` — ON-DEMAND NEIGHBOR FETCH**~~ — **DONE (`v15`).** Reduction now uses on-demand successor fetches rather than retaining full topo adjacency plus a second adjacency copy.                                                                                                                                               |
| B151 | ~~**LARGE-GRAPH `transitiveClosure()` — STREAMING OUTPUT**~~ — **DONE (`v15`).** Added `transitiveClosureStream()` and rewired `transitiveClosure()` to collect from the stream for compatibility.                                                                                                                                                              |
| B153 | ~~**`topologicalSort` LIGHTWEIGHT MODE**~~ — **DONE (`v15`).** Topological discovery now skips full adjacency retention when callers do not request it.                                                                                                                                                                                                         |
| B154 | ~~**`transitiveReduction` REDUNDANT ADJLIST COPY**~~ — **DONE (`v15`).** Removed the extra adjacency-only copy from reduction.                                                                                                                                                                                                                                  |
| B166 | ~~**ADAPTER CLEANUP CONTRACTS**~~ — **DONE (`v15`).** `NodeWsAdapter` now cleans up partial startup state and shuts down idempotently.                                                                                                                                                                                                                          |
