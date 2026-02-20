# Backlog-to-Milestone Reconciliation

**Repo:** `@git-stunts/git-warp` v11.3.2
**Date:** 2026-02-19
**Velocity Cap:** 60 hours/milestone (inferred from historical M7 ~60h ceiling)
**Baseline:** 0 tsc errors, 0 `{*}`/`any` casts, 30,334 src LOC

---

## 1. Map & Triage

### Orphan Candidates (Standalone items that should be promoted)

| ID | Current | Proposed | Rationale |
|----|---------|----------|-----------|
| B50 | Standalone | **M8 Phase 1** | Directly feeds B42's CI gate — manifest must exist before validation can be built |
| B52 | Standalone | **M8 Phase 2** | IRONCLAD leftovers (TickReceipt wildcards, verify-audit returns, SyncAuthService JSDoc) |
| B55 | Standalone | **M8 Phase 2** | HttpServerPort type tightening is cast-elimination work |
| B57 | Standalone | **M8 Phase 3** | Overlaps/feeds B42 — auto-validate manifest against `.d.ts` is the same CI gate |
| B48 | Standalone | **M8 Phase 3** | ESLint guard prevents the pattern B51 audits — CI prevention > manual audit |
| B51 | Standalone | **M8 Phase 2** | Same pattern as CommitDagTraversalService fix (0cead99); natural bundle with B30 |
| B56 | Standalone | **M10 pre-req** | Potential correctness bug in sync `observedFrontier` double-cast — must resolve before M10 hardens sync trust |
| B53 | Standalone | **Urgent/unblocked** | Blocks JSR publishing — independent of milestones, should be fixed ASAP |

### True Orphans (correct to leave unassigned)

| ID | Rationale for standalone |
|----|------------------------|
| B46 | One-line ESLint config change, no dependencies |
| B47 | Domain boundary validation, tiny scope |
| B26 | Named constant, < 10 LOC |
| B44 | Event system edge case, independent |
| B34 | Docs extraction, no code dependencies |
| B35 | Docs only |
| B36 | Test helper, opportunistic |
| B37 | Test fixture dedup, opportunistic |
| B43 | CI config, independent |
| B12 | Pre-commit hook, independent |
| B49 | ts-policy-check refinement, low priority |
| B54 | Zod helper, convenience |
| B19+B22 | Property test pack, independent |
| B28 | Post-M8 stub, explicit dependency |

### Gaps

| Milestone | Gap Description |
|-----------|----------------|
| **M8** | Missing B50 (manifest creation) — B42 has no manifest to validate without it |
| **M8** | Missing B57 — the CI gate for B42 needs the automation from B57 |
| **M9** | B33 scope may be stale — `WarpGraph.js` is already 415 LOC (gate is <500), and sync methods already extracted to `sync.methods.js`. Re-scope needed. |
| **M10** | Missing B56 — `observedFrontier` double-cast could be a latent sync correctness bug; must investigate before hardening sync trust |

---

## 2. Dependency Check

### Dependency Graph

```text
Depth 0 (no deps):
  B29, B38, B14, B46, B47, B26, B53, B50

Depth 1 (depends on depth-0):
  B30  ← blocks on B29 (type fixes enable cast elimination)
  B52  ← blocks on B29 (type fixes inform which wildcards remain)
  B55  ← blocks on B29 (HttpServerPort types depend on declaration fixes)
  B51  ← blocks on B29

Depth 2:
  B41  ← blocks on B30 (auto-generate after casts eliminated)
  B42  ← blocks on B50 + B41 (validate manifest against generated .d.ts)
  B48  ← blocks on B51 (ESLint guard after manual audit)

Depth 3:
  B57  ← blocks on B42 (CI automation wraps the validation gate)
  B28  ← blocks on B29 (compile-only stub needs correct .d.ts)
  [M8 GATE] ← blocks on B41+B42+B57

Depth 4:
  B33  ← blocks on [M8 GATE]
  B32  ← blocks on [M8 GATE]
  B31  ← blocks on [M8 GATE] (opportunistic, during decomposition)

Depth 5:
  [M9 GATE] ← blocks on B33+B32

Depth 6:
  B56  ← must complete before B1 (investigate before hardening)
  B1   ← blocks on [M9 GATE]
  B39  ← independent, can parallel B1
  B40  ← independent, can parallel B1
  B2(spec) ← independent, can parallel B1

Depth 7:
  [M10 GATE] ← blocks on B1+B39+B40+B2(spec)+B56

Depth 8:
  B2(impl) ← blocks on [M10 GATE] + B2(spec)
  B3       ← blocks on [M10 GATE]
  B11      ← blocks on [M10 GATE]

Depth 9:
  [M11 GATE]
```

**No circular dependencies detected.**

---

## 3. Schedule into Milestones

### M8 — IRONCLAD (Type Safety) — 55.5h / 60h capacity

| Phase | Items | Expected Hours |
|-------|-------|---------------|
| Phase 1 | B29, B38, B14, **B50** | 17.3h |
| Phase 2 | B30, **B52**, **B55**, **B51** | 19.5h |
| Phase 3 | B41, B42, **B48**, **B57** | 18.7h |
| **Total** | **11 items** | **55.5h** (92.5% fill) |

### M9 — PARTITION (Decomposition) — 31.7h / 60h capacity

| Task | Items | Expected Hours |
|------|-------|---------------|
| T1 | B33 (re-scoped) | 12.0h |
| T2 | B32 | 14.0h |
| T3 | B31 | 5.7h |
| **Total** | **3 items** | **31.7h** (52.8% fill) |

### M10 — SENTINEL (Trust Hardening) — 42.0h / 60h capacity

| Task | Items | Expected Hours |
|------|-------|---------------|
| Pre-req | **B56** | 5.0h |
| T1 | B1 | 16.0h |
| T2 | B39, B40 | 9.0h |
| T3 | B2 (spec) | 12.0h |
| **Total** | **5 items** | **42.0h** (70.0% fill) |

### M11 — COMPASS II (Developer Experience) — 36.0h / 60h capacity

| Task | Items | Expected Hours |
|------|-------|---------------|
| T1 | B2 (impl) | 16.0h |
| T2 | B3 | 12.0h |
| T3 | B11 | 8.0h |
| **Total** | **3 items** | **36.0h** (60.0% fill) |

---

## 4. Per-Task Estimates & Specs

---

### B29 — `index.d.ts` Type Fixes
- **Feature:** M8 IRONCLAD Phase 1 (Alignment: **high**)
- **User Story:** As a TypeScript consumer, I want `createPatch()` to return `Promise<PatchSession>` not `Promise<unknown>`, so that downstream type inference works without casts.
- **Estimate:** O: 3h | M: 5h | P: 10h → **Expected: 5.5h** (σ: 1.2h)
- **Depth:** 0 | Critical Path: **yes**
- **Scope:**
  - In: Fix `createPatch()`, `materialize()`, `syncCoverage()`, `materializeAt()`, `logNodes` format optional return types in `index.d.ts`
  - Out: Auto-generation (B41); new API surface; runtime changes
- **Tests:** Golden: `tsc --noEmit` on minimal consumer passes | Failure: old incorrect types cause compile error | Edge: overloaded methods with conditional returns | Fuzz: n/a (declaration file)

---

### B38 — Deno Ambient Type Declaration
- **Feature:** M8 IRONCLAD Phase 1 (Alignment: **high**)
- **User Story:** As a Deno runtime user, I want `Deno` to be declared as an ambient type, so that `@ts-expect-error` annotations are eliminated.
- **Estimate:** O: 0.5h | M: 1h | P: 2h → **Expected: 1.1h** (σ: 0.25h)
- **Depth:** 0 | Critical Path: no
- **Scope:**
  - In: Create `globals.d.ts` with `declare const Deno: any`; remove scattered `@ts-expect-error` annotations
  - Out: Deno-specific runtime features; type-narrowing Deno APIs
- **Tests:** Golden: `tsc --noEmit` clean | Failure: n/a | Edge: Deno namespace already declared in test envs | Fuzz: n/a

---

### B14 — `HttpSyncServer` Config Validation Layer
- **Feature:** M8 IRONCLAD Phase 1 (Alignment: **high**)
- **User Story:** As a deployer, I want invalid/contradictory server config to fail at construction time, so that misconfiguration is caught before traffic arrives.
- **Estimate:** O: 4h | M: 6h | P: 12h → **Expected: 6.7h** (σ: 1.3h)
- **Depth:** 0 | Critical Path: no
- **Scope:**
  - In: Zod schema for `HttpSyncServer` constructor options; validate impossible combos (e.g., `auth: enforce` without key); clear error messages
  - Out: Runtime request validation (already exists); changing option semantics
- **Tests:** Golden: valid config → server starts | Failure: contradictory config → `ZodError` with path | Edge: empty config → sensible defaults | Fuzz: random option shapes → no crash, clear rejection

---

### B50 — Align `type-surface.m8.json` with `index.d.ts` *(promoted)*
- **Feature:** M8 IRONCLAD Phase 1 (Alignment: **high**)
- **User Story:** As a CI pipeline, I need a correct type-surface manifest, so that B42's validation has a source of truth.
- **Estimate:** O: 2h | M: 4h | P: 6h → **Expected: 4.0h** (σ: 0.7h)
- **Depth:** 0 | Critical Path: **yes** (blocks B42)
- **Scope:**
  - In: Create/update manifest with all public methods, params, returns; include `syncWith.state`, `setSeekCache`
  - Out: Automation of manifest updates (B57)
- **Tests:** Golden: manual diff against `index.d.ts` shows parity | Failure: missing method → documented | Edge: overloaded signatures | Fuzz: n/a

---

### B30 — `any` Cast Cleanup + `WarpPersistence` Type
- **Feature:** M8 IRONCLAD Phase 2 (Alignment: **high**)
- **User Story:** As a maintainer, I want zero `any`/`{*}` casts in `src/`, so that the type system provides real safety guarantees.
- **Estimate:** O: 6h | M: 10h | P: 18h → **Expected: 10.7h** (σ: 2.0h) ⚠️ **Risk: σ at 18.7% of E**
- **Depth:** 1 | Critical Path: **yes**
- **Scope:**
  - In: Define `WarpPersistence` union type; replace remaining wildcard casts; validate each replacement with runtime guard or honest narrowing
  - Out: Refactoring persistence interface; changing runtime behavior
  - **Note:** Current count is 0 wildcard casts — B30's scope may need re-baseline. If already done, this becomes a verification pass.
- **Tests:** Golden: `grep -rE '@type {(\*|any)}' src/` returns 0 | Failure: new cast introduced → CI blocks | Edge: port types with runtime-composed methods | Fuzz: n/a

---

### B52 — Fix Outside-Diff IRONCLAD Review Items *(promoted)*
- **Feature:** M8 IRONCLAD Phase 2 (Alignment: **medium**)
- **User Story:** As a maintainer, I want IRONCLAD review findings fixed, so that type accuracy is complete.
- **Estimate:** O: 1h | M: 2h | P: 4h → **Expected: 2.2h** (σ: 0.5h)
- **Depth:** 1 | Critical Path: no
- **Scope:**
  - In: TickReceipt `sortedReplacer` wildcards, verify-audit.js `@returns`, SyncAuthService `keys` optional JSDoc
  - Out: Behavioral changes
- **Tests:** Golden: tsc clean after fixes | Failure: n/a | Edge: optional JSDoc semantics | Fuzz: n/a

---

### B55 — Upgrade `HttpServerPort` Request/Response Types *(promoted)*
- **Feature:** M8 IRONCLAD Phase 2 (Alignment: **medium**)
- **User Story:** As a contributor, I want typed request/response objects, so that port implementations don't need inline casts.
- **Estimate:** O: 2h | M: 3h | P: 6h → **Expected: 3.3h** (σ: 0.7h)
- **Depth:** 1 | Critical Path: no
- **Scope:**
  - In: `Record<string, string>` for headers; shared request/response typedefs; fix HttpSyncServer, Node/Bun/Deno adapter casts
  - Out: Changing HTTP semantics; new middleware
- **Tests:** Golden: all adapters pass with tighter types | Failure: adapter mismatch caught at compile | Edge: multi-value headers (arrays) | Fuzz: n/a

---

### B51 — Audit Remaining `= {}` Constructor Defaults *(promoted)*
- **Feature:** M8 IRONCLAD Phase 2 (Alignment: **medium**)
- **User Story:** As a type-system user, I want constructors to require their options, so that `= {}` doesn't silently swallow missing required params.
- **Estimate:** O: 1.5h | M: 3h | P: 5h → **Expected: 3.1h** (σ: 0.6h)
- **Depth:** 1 | Critical Path: no
- **Scope:**
  - In: DagTraversal, DagPathFinding, DagTopology, BitmapIndexReader — remove `= {}` defaults, add `@ts-expect-error` negative tests
  - Out: New constructor APIs; changing existing test callsites beyond fixes
- **Tests:** Golden: constructors require args | Failure: `@ts-expect-error` tests prove missing args fail | Edge: optional sub-fields within required object | Fuzz: n/a

---

### B41 — Auto-Generate `.d.ts` from JSDoc
- **Feature:** M8 IRONCLAD Phase 3 (Alignment: **high**)
- **User Story:** As a maintainer, I want declarations auto-generated from JSDoc, so that `index.d.ts` never drifts from implementation.
- **Estimate:** O: 3h | M: 5h | P: 10h → **Expected: 5.5h** (σ: 1.2h)
- **Depth:** 2 | Critical Path: **yes**
- **Scope:**
  - In: `tsc --declaration --emitDeclarationOnly` pipeline; post-processing to match current `index.d.ts` shape; npm script
  - Out: Changing public API surface; manual `.d.ts` maintenance
- **Tests:** Golden: generated `.d.ts` matches hand-written (or supersedes) | Failure: JSDoc gap → missing declaration → CI fail | Edge: re-exported types, conditional exports | Fuzz: n/a

---

### B42 — CI `.d.ts` Signature Validation
- **Feature:** M8 IRONCLAD Phase 3 (Alignment: **high**)
- **User Story:** As a CI pipeline, I need semantic shape validation of `.d.ts`, so that parameter types and return types match runtime exports.
- **Estimate:** O: 4h | M: 6h | P: 12h → **Expected: 6.7h** (σ: 1.3h)
- **Depth:** 2 | Critical Path: **yes**
- **Scope:**
  - In: CI step parsing `.d.ts`; compare against manifest (B50) or runtime exports; validate parameter types + return types
  - Out: Runtime type checking; publishing pipeline changes
- **Tests:** Golden: clean codebase passes | Failure: intentional drift → CI blocks with actionable message | Edge: overloaded signatures, generic returns | Fuzz: malformed `.d.ts` input

---

### B48 — ESLint Ban `= {}` Constructor Defaults *(promoted)*
- **Feature:** M8 IRONCLAD Phase 3 (Alignment: **medium**)
- **User Story:** As a maintainer, I want an ESLint rule preventing `= {}` defaults on constructors with required params, so that the pattern can't regress.
- **Estimate:** O: 1h | M: 2h | P: 4h → **Expected: 2.2h** (σ: 0.5h)
- **Depth:** 2 | Critical Path: no
- **Scope:**
  - In: `no-restricted-syntax` or custom rule config in `eslint.config.js`
  - Out: Existing violations (fixed by B51)
- **Tests:** Golden: new violation → lint error | Failure: rule doesn't match pattern → false negative | Edge: `= {}` on truly optional params (allowlist) | Fuzz: n/a

---

### B57 — CI Auto-Validate `type-surface.m8.json` Against `index.d.ts` *(promoted)*
- **Feature:** M8 IRONCLAD Phase 3 (Alignment: **high**)
- **User Story:** As a CI pipeline, I need automatic drift detection between manifest and declarations, so that B50 stays current.
- **Estimate:** O: 2h | M: 4h | P: 8h → **Expected: 4.3h** (σ: 1.0h)
- **Depth:** 3 | Critical Path: no (parallel to B42, partially overlapping)
- **Scope:**
  - In: Script parsing manifest + `.d.ts`; CI gate in pre-push or GitHub Actions
  - Out: Manifest auto-generation (manual updates are fine)
- **Tests:** Golden: aligned files → pass | Failure: missing method → actionable error | Edge: renamed methods, moved types | Fuzz: n/a

---

### B33 — SyncController Extraction
- **Feature:** M9 PARTITION (Alignment: **high**)
- **User Story:** As a maintainer, I want sync concerns isolated from graph concerns, so that each module has a single responsibility.
- **Estimate:** O: 6h | M: 12h | P: 20h → **Expected: 12.3h** (σ: 2.3h) ⚠️ **Risk: σ at 18.7% of E**
- **Depth:** 4 | Critical Path: **yes**
- **Scope:**
  - In: Extract `sync.methods.js` (554 LOC) + `SyncProtocol.js` (604 LOC) + `HttpSyncServer.js` (396 LOC) coordination into `SyncController.js`; WarpGraph delegates to controller
  - Out: Changing sync semantics; HTTP transport changes
  - **Note:** WarpGraph is already 415 LOC (<500 gate). Re-scope: the extraction target is the coordination layer, not LOC reduction. Focus on isolating the network concern boundary.
- **Tests:** Golden: full regression suite green with identical behavior | Failure: sync-dependent tests fail → behavior parity broken | Edge: race conditions during extraction (ref ordering) | Fuzz: n/a

---

### B32 — JoinReducer Dual-Path Refactor
- **Feature:** M9 PARTITION (Alignment: **high**)
- **User Story:** As a contributor, I want `join()` split into `applyFast()` and `applyWithReceipt()`, so that new op types can't be missed in the receipt path.
- **Estimate:** O: 8h | M: 14h | P: 22h → **Expected: 14.0h** (σ: 2.3h) ⚠️ **Risk: σ at 16.4% of E**
- **Depth:** 4 | Critical Path: **yes** (co-critical with B33)
- **Scope:**
  - In: Strategy pair pattern; shared op dispatch table; receipt-path guaranteed to handle all ops
  - Out: Changing CRDT semantics; new op types
- **Tests:** Golden: no-coordination suite green | Failure: missing op in receipt path → compile/lint error | Edge: empty patches, tombstone-only patches | Fuzz: random op sequences → deterministic output

---

### B31 — Bitmap Index OID Validation
- **Feature:** M9 PARTITION (Alignment: **low**)
- **User Story:** As an operator, I want invalid OIDs rejected at index load time, so that corrupt indexes don't silently produce wrong results.
- **Estimate:** O: 2h | M: 5h | P: 10h → **Expected: 5.3h** (σ: 1.3h)
- **Depth:** 4 | Critical Path: no (opportunistic)
- **Scope:**
  - In: Strict OID validation pass in `BitmapIndexReader.setup()` (450 LOC file)
  - Out: Index rebuilding; changing bitmap format
- **Tests:** Golden: valid index loads | Failure: corrupt OID → actionable error with shard/offset | Edge: empty shards, single-entry shards | Fuzz: random bytes in OID positions → clean rejection

---

### B56 — Investigate `observedFrontier` Semantic Mismatch *(promoted)*
- **Feature:** M10 SENTINEL pre-req (Alignment: **high**)
- **User Story:** As a maintainer, I need to determine whether the `observedFrontier` double-cast is a latent correctness bug or intentional, so that sync trust hardening builds on a sound foundation.
- **Estimate:** O: 2h | M: 5h | P: 10h → **Expected: 5.3h** (σ: 1.3h)
- **Depth:** 6 | Critical Path: **yes** (blocks M10 trust hardening)
- **Scope:**
  - In: Investigate `sync.methods.js:261` double-cast; trace data flow; fix or document
  - Out: Rewriting sync protocol
- **Tests:** Golden: correct type flows through sync | Failure: if bug → regression test for the fix | Edge: mixed version-vector shapes across writers | Fuzz: n/a

---

### B1 — Strict Provenance / Signed Sync Ingress
- **Feature:** M10 SENTINEL (Alignment: **high**)
- **User Story:** As a deployer, I want all sync ingress to require signed commits, so that the trust boundary is complete end-to-end.
- **Estimate:** O: 8h | M: 16h | P: 28h → **Expected: 16.3h** (σ: 3.3h) ⚠️ **Risk: σ at 20.2% of E**
- **Depth:** 6 | Critical Path: **yes**
- **Scope:**
  - In: Enforce signed commits on sync ingress; integrate with M7 trust evaluation; reject unsigned patches in enforce mode
  - Out: Key distribution; new signing algorithms
- **Tests:** Golden: signed commit accepted | Failure: unsigned → rejected with reason code | Edge: mixed signed/unsigned from same writer | Fuzz: corrupt signatures, truncated payloads

---

### B39 — Trust Record CAS Retry
- **Feature:** M10 SENTINEL (Alignment: **medium**)
- **User Story:** As an operator, I want trust record persistence to retry on CAS failure, so that transient ref contention doesn't lose trust records.
- **Estimate:** O: 1h | M: 3h | P: 6h → **Expected: 3.2h** (σ: 0.8h)
- **Depth:** 6 | Critical Path: no
- **Scope:**
  - In: Retry-once in `TrustRecordService._persistRecord`; mirror `AuditReceiptService` pattern
  - Out: Multi-retry strategies; backoff logic (already in `@git-stunts/alfred`)
- **Tests:** Golden: first attempt succeeds | Failure: first fails, retry succeeds | Edge: both attempts fail → clear error | Fuzz: concurrent writers contending on same ref

---

### B40 — BATS E2E: `git warp trust` Output Shapes
- **Feature:** M10 SENTINEL (Alignment: **medium**)
- **User Story:** As a CI pipeline, I need E2E tests for trust CLI output, so that JSON schema and exit codes don't regress.
- **Estimate:** O: 3h | M: 5h | P: 10h → **Expected: 5.5h** (σ: 1.2h)
- **Depth:** 6 | Critical Path: no
- **Scope:**
  - In: BATS tests for JSON output schema, exit codes, `not_configured` default behavior
  - Out: New trust subcommands; UI changes
- **Tests:** Golden: expected JSON shape + exit 0 | Failure: malformed output → test catches | Edge: empty trust store | Fuzz: n/a

---

### B2 (spec) — Causality Bisect Spec
- **Feature:** M10 SENTINEL (Alignment: **high**)
- **User Story:** As a developer, I want a bisect spec with test vectors, so that the debugging tool has an unambiguous contract.
- **Estimate:** O: 6h | M: 12h | P: 18h → **Expected: 12.0h** (σ: 2.0h) ⚠️ **Risk: σ at 16.7% of E**
- **Depth:** 6 | Critical Path: **yes** (blocks B2 impl)
- **Scope:**
  - In: `docs/specs/CAUSALITY_BISECT.md`; CLI contract; data model; test vectors with expected outputs
  - Out: Implementation (M11); UI
- **Tests:** Golden: spec vectors parseable and unambiguous | Failure: contradictory vectors detected in review | Edge: single-tick histories, no-fault histories | Fuzz: n/a

---

### B2 (impl) — Causality Bisect Implementation
- **Feature:** M11 COMPASS II (Alignment: **high**)
- **User Story:** As a developer, I want `git warp bisect` to find the first bad tick, so that regressions are diagnosed without manual replay.
- **Estimate:** O: 8h | M: 16h | P: 28h → **Expected: 16.3h** (σ: 3.3h) ⚠️ **Risk: σ at 20.2% of E**
- **Depth:** 8 | Critical Path: **yes**
- **Scope:**
  - In: Binary search over tick history; invariant predicate interface; CLI command; JSON output
  - Out: Automated fix suggestions; integration with external tools
- **Tests:** Golden: seeded regression found at correct tick | Failure: no fault → clean report | Edge: single-patch history, all-faulty history | Fuzz: random invariant predicates

---

### B3 — Observer API
- **Feature:** M11 COMPASS II (Alignment: **high**)
- **User Story:** As an application developer, I want a stable public event contract, so that I can react to graph mutations without polling.
- **Estimate:** O: 6h | M: 12h | P: 20h → **Expected: 12.3h** (σ: 2.3h) ⚠️ **Risk: σ at 18.7% of E**
- **Depth:** 8 | Critical Path: no
- **Scope:**
  - In: Public API surface for subscribe/unsubscribe; event type definitions; snapshot tests for contract
  - Out: Reactive framework integration; backpressure
- **Tests:** Golden: subscribe → mutate → callback fires with correct event | Failure: unsubscribe → no callback | Edge: unsubscribe-during-callback (B44 prerequisite) | Fuzz: rapid subscribe/unsubscribe cycling

---

### B11 — `graph.patchMany(fns)` Batch API
- **Feature:** M11 COMPASS II (Alignment: **medium**)
- **User Story:** As a developer, I want to sequence multiple patch callbacks atomically, so that each sees the ref left by the previous.
- **Estimate:** O: 3h | M: 8h | P: 14h → **Expected: 8.2h** (σ: 1.8h)
- **Depth:** 8 | Critical Path: no
- **Scope:**
  - In: `graph.patchMany([fn1, fn2, ...], opts?)`; sequential execution; each sees prior commit's ref
  - Out: Parallel patch execution; transaction rollback
- **Tests:** Golden: 3 patches in sequence, each sees prior's state | Failure: callback throws → partial commit state documented | Edge: empty array, single callback | Fuzz: random callback counts + orderings in no-coordination suite

---

## 5. Audit

### Dependency Ordering Validation

| Check | Result |
|-------|--------|
| No task depends on something in a later milestone | **PASS** — all depth-0 items in M8 Phase 1; B56 promoted to M10 pre-req before B1 |
| No orphan tasks in milestones | **PASS** — all promoted items have clear alignment rationale |
| Foundation tasks (depth 0) in earliest milestone | **PASS** — B29/B38/B14/B50 all in M8 Phase 1 |

### LOC-to-Hour Ratios

| Task | Est. LOC | Expected Hours | LOC/hr | Flag |
|------|----------|---------------|--------|------|
| B29 | ~200 | 5.5h | 36 | OK |
| B14 | ~120 | 6.7h | 18 | OK |
| B30 | ~400 | 10.7h | 37 | OK |
| B33 | ~300 | 12.3h | 24 | OK (refactor, not greenfield) |
| B32 | ~500 | 14.0h | 36 | OK |
| B1 | ~600 | 16.3h | 37 | OK |
| B2(impl) | ~800 | 16.3h | 49 | OK |

All within 75 LOC/hr threshold.

### High-Risk Tasks (σ > 25% of E)

None exceed 25%. Flagged items at 16-20%:

| Task | σ/E | Mitigation |
|------|-----|------------|
| B30 | 18.7% | Re-baseline: cast count may already be 0; verify before estimating remaining work |
| B33 | 18.7% | WarpGraph already <500 LOC; re-scope to coordination extraction, not LOC reduction |
| B1 | 20.2% | Builds on existing M7 trust infrastructure; risk is in edge cases, not greenfield |
| B2(impl) | 20.2% | Mitigated by spec-first approach (B2 spec lands in M10) |
| B3 | 18.7% | Internal soak since PULSE (M7); risk is in public contract freeze, not implementation |

### Stale Scope Warnings

| Item | Warning |
|------|---------|
| **B30** | Acceptance criterion `grep -rE '@type {(\*\|any)}' src/` already returns zero. Either B30 is effectively done (needs verification pass only) or the acceptance criterion needs updating to cover `@param`/`@returns` wildcards. **Recommend re-baseline before starting.** |
| **B33** | WarpGraph is 415 LOC (gate is <500). Sync methods already extracted to `sync.methods.js`. The original "reduces god class by ~800 LOC" description is stale. **Re-scope to coordination-layer isolation.** |
| **B50** | `type-surface.m8.json` doesn't exist yet. This is a creation task, not an alignment task. |

---

## Summary

### Milestone Breakdown

| Milestone | Items | Fill | Notes |
|-----------|-------|------|-------|
| **M8 IRONCLAD** | 11 | **55.5 / 60h (92.5%)** | 6 items promoted from standalone; tight but doable |
| **M9 PARTITION** | 3 | **31.7 / 60h (52.8%)** | Slack available — B33 scope may shrink further |
| **M10 SENTINEL** | 5 | **42.0 / 60h (70.0%)** | B56 added as pre-req; B2 spec is spec-only |
| **M11 COMPASS II** | 3 | **36.0 / 60h (60.0%)** | Comfortable capacity |
| **Total** | **22 milestone items** | **165.2h** | ~4 milestone sprints |

### Orphan Tasks (no milestone home — by design)

B46, B47, B26, B44, B34, B35, B36, B37, B43, B12, B49, B54, B19, B22, B28 (15 items, ~25-35h aggregate)

### Gaps Identified

1. **M8 missing B50** — manifest doesn't exist; B42 CI validation has no source of truth without it
2. **M8 missing B57** — CI automation for manifest drift detection completes the B42 story
3. **M10 missing B56** — potential correctness bug in sync frontier double-cast must be resolved before trust hardening
4. **B30 scope stale** — cast count already at zero; needs re-baseline

### Dependency Warnings

1. **B42 → B50** — B42 cannot validate what doesn't exist. B50 must land in Phase 1 or early Phase 2.
2. **B56 → B1** — Hardening sync trust on top of a potential type-coercion bug is dangerous. Investigate first.
3. **B33 re-scope needed** — The original description references "~800 LOC reduction" in WarpGraph, but WarpGraph is already 415 LOC. The extraction target should be the coordination boundary, not LOC.

### Urgent / Unblocked (outside milestones)

**B53** (JSR Deno panic) — blocks publishing, independent of all milestones, should be fixed opportunistically.
