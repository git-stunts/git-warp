# OPERATION: WARP VELOCITY — EDITOR'S EDITION: GENERALISSIMO GPT CUT

> **Status:** LOCKED FOR EXECUTION
> **Release Target:** v2.0 = Trust Core
> **Prime Directive:** If it does not improve trust, verification, or operational safety, it does not get into v2.0.

---

## Commander's Intent

Ship a v2.0 that can survive:

1. adversarial security review,
2. forensic audit scrutiny,
3. real operator incidents at 2 AM.

Everything else is secondary.

---

## Non-Negotiable Release Promise (v2.0)

By v2.0, operators can:

- authenticate sync traffic with replay protection,
- generate immutable, deterministic audit receipts,
- cryptographically verify chain-of-custody,
- diagnose common failure states quickly.

If any of those are weak, we do not ship.

---

## What Got Cut (On Purpose)

**Removed from v2.0 core:**

- Risky semantic rewrite: sync-builder Lamport prefetch model
- Optional reactive API surface (observer) unless capacity remains
- Cosmetic "perfect audit score" work beyond exploitable risk triage

**Replaced with safer alternative:**

- Single-await ergonomics via `graph.patch(fn)` wrapper (same semantics, less user friction)

---

## Completed Milestones

All 12 milestones (77 tasks, ~255 human hours, ~13,100 LOC) have been implemented and verified.

| # | Codename | Version | Theme |
|---|----------|---------|-------|
| 1 | AUTOPILOT | v7.1.0 | Kill the Materialize Tax |
| 2 | GROUNDSKEEPER | v7.2.0 | Self-Managing Infrastructure |
| 3 | WEIGHTED | v7.3.0 | Edge Properties |
| 4 | HANDSHAKE | v7.4.0 | Multi-Writer Ergonomics |
| 5 | COMPASS | v7.5.0 | Advanced Query Language |
| 6 | LIGHTHOUSE | v7.6.0 | Observability |
| 7 | PULSE | v7.7.0 | Subscriptions & Reactivity |
| 8 | HOLOGRAM | v8.0.0 | Provenance & Holography |
| 9 | ECHO | v9.0.0 | Observer Geometry |
| 10 | BULKHEAD | v10.0.0 | Hexagonal Purity & Structural Integrity |
| 11 | RECALL | v10.4.0 | Seek Materialization Cache |
| 12 | SEEKDIFF | v10.5.0 | Structural Seek Diff |

---

## Milestone 1 — IRON DOME

**Theme:** Security & protocol hardening
**Objective:** Make sync requests fresh, authentic, and replay-resistant.

### M1.T1.SHIELD — Hardened Sync Auth (S-Tier)

- **Status:** `DONE`

**User Story:** As a deployer, I need cryptographic proof that sync requests are authentic, fresh, and unique.

**Requirements:**

- Required headers:
  - `x-warp-sig-version: 1`
  - `x-warp-signature`
  - `x-warp-timestamp` (epoch ms)
  - `x-warp-nonce`
- Canonical signed payload:
  - `warp-v1|${METHOD}|${RAW_PATH_WITH_QUERY}|${TIMESTAMP}|${NONCE}|${CONTENT_TYPE}|${BODY_SHA256}`
- Normalization:
  - METHOD uppercase
  - raw path+query exact as received (no decode/re-encode)
  - content-type lowercase or empty string
  - body hash = SHA-256(raw body), empty string for no-body
- Replay defense:
  - reject if `abs(now - timestamp) > 5m`
  - nonce dedupe cache TTL 5m
  - LRU capacity 100k baseline
  - shard or quota by peer to prevent nonce-flood eviction abuse
- Signature compare:
  - `crypto.timingSafeEqual`
- Upgrade mode:
  - `--auth-mode=enforce|log-only` (default log-only during rollout)
- Observability:
  - metrics: `auth_fail_reason`, `replay_reject_count`, `nonce_evictions`, `clock_skew_rejects`

**Acceptance Criteria:**

- Missing/invalid version header -> 400
- Missing signature fields -> 401
- Stale timestamp -> 403 EXPIRED
- Reused nonce -> 403 REPLAY
- Valid signed request -> 200

**Performance Budget:** auth overhead < 2ms p95 (defined benchmark profile)

**Definition of Done:**

- unit + integration tests complete
- 2-node sync test in both log-only and enforce
- SECURITY.md includes restart policy and limitations
- benchmark report checked in

**Estimate:** 10-12 hours

### M1.T2.HYGIENE — Exploitable Risk Triage (C/B-Tier)

- **Status:** `DONE`

**User Story:** As a maintainer, I need a defendable security posture, not vanity metrics.

**Requirements:**

- audit runtime dependency risk for exploitability
- upgrade vulnerable packages where practical
- create/update SECURITY.md:
  - reporting path
  - accepted risks with expiry/owner
  - threat model boundaries

**Acceptance Criteria:** no known exploitable HIGH in runtime path; CI gate reflects exploitability policy (not blind audit score worship)

**Definition of Done:** triage log committed; policy committed

**Estimate:** 3-5 hours

---

## Milestone 2 — FOUNDATION LIFT

**Theme:** Developer velocity for correctness work
**Objective:** Build test and CLI infrastructure that accelerates safe delivery.

### M2.T1.MEM-ADAPTER (A-Tier)

- **Status:** `DONE`

**User Story:** As an architect, I need fast in-memory tests to validate risky logic quickly.

**Requirements:**

- InMemoryGraphAdapter implementing GraphPersistencePort
- parity behaviors with Git adapter (including integrity constraints where relevant)
- shared tests run against both adapters

**Delivered in v10.7.0.**

**Acceptance Criteria:** domain suite passes on memory + git adapters

**Definition of Done:** adapter integrated in test harness; CI includes adapter matrix lane

**Estimate:** 8-10 hours

### M2.T2.PRESENTER — Output Contracts (A-Tier)

- **Status:** `DONE`

**User Story:** As a contributor, I need command logic separated from rendering for stable machine outputs.

**Requirements:**

- `bin/presenters/index.js`
- command handlers return plain data objects
- serializer contracts:
  - deterministic key order for snapshots
  - NDJSON: one object per line
  - no-color mode via `NO_COLOR` + CI detection

**Acceptance Criteria:** legacy human output unchanged (byte-equivalent where promised); JSON/NDJSON contract tests green

**Definition of Done:** BATS regression suite passes; snapshot tests for JSON outputs

**Estimate:** 6-8 hours

### M2.T3.SIGNPOSTS + DEFAULTS (B-Tier bundle)

- **Status:** `DONE`

**User Story:** As a new dev, I should hit fewer dead ends and get immediate recovery hints.

**Requirements:**

- improve `E_NO_STATE` / `E_STALE_STATE` messages
- include recovery hint + docs URL
- default `autoMaterialize=true`
- publish migration doc with performance note

**Acceptance Criteria:**

- `open()` -> `hasNode()` works by default
- explicit `autoMaterialize=false` still errors as designed
- error messages include actionable fix

**Definition of Done:** docs + migration examples added; regression tests updated

**Estimate:** 3-4 hours

---

## Milestone 3 — GHOST PROTOCOL

**Theme:** Immutable audit trail
**Objective:** Deterministic receipts first, implementation second.

### M3.T0.SPEC — Hard Gate (S-Tier)

- **Status:** `DONE`

**User Story:** As an architect, I need deterministic receipt spec with zero ambiguity.

**Requirements:**

Create `docs/specs/AUDIT_RECEIPT.md` with:

- required fields:
  - `version`
  - `writerId`
  - `dataCommit`
  - `tickStart`
  - `tickEnd`
  - `opsDigest`
  - `prevAuditCommit`
  - `timestamp`
- canonical serialization rules
- hash algorithm (SHA-256)
- chunking strategy
- genesis/chain rules
- trust/version compatibility section
- test vectors:
  - canonical fixtures + expected digests
  - negative fixture behavior

**Acceptance Criteria:** lead approval; verifier fixture tests pass from spec vectors

**Definition of Done:** spec committed and referenced by implementation docs

**Estimate:** 4-6 hours

### M3.T1.SHADOW-LEDGER (S-Tier)

- **Status:** `DONE`

**User Story:** As an auditor, I need tamper-evident receipts stored immutably and linked to data commits.

**Requirements:**

- implement ReceiptBlockBuilder per spec
- flush receipt blocks to Git blobs
- construct audit tree
- commit to `refs/audit/<writer-id>`
- include deterministic metadata/trailers
- gate behind `audit: true` or feature flag during rollout

**Acceptance Criteria:**

- audit ref advances correctly
- blobs decode and validate against spec
- million-receipt stress run meets memory budget

**Performance Budget:** Max RSS < 500MB on defined stress profile

**Rollback:** feature flag to disable audit logging path instantly

**Definition of Done:**

- integration tests validate object/ref layout
- deterministic replay tests green
- stress + benchmark artifacts checked in

**Estimate:** 16-22 hours

---

## Milestone 4 — VERIFY OR IT DIDN'T HAPPEN

**Theme:** Cryptographic verification
**Objective:** Prove chain-of-custody, detect tampering deterministically.

### M4.T1.VERIFY-AUDIT (S-Tier)

- **Status:** `DONE`

**User Story:** As an operator, I need a definitive verification command for audit integrity.

**Requirements:**

- command: `git warp verify-audit <ref>`
- trust root configuration:
  - `WARP_TRUSTED_ROOT` env
  - `.warp/trust.json`
- modes:
  - `--since <commit>`
  - `--format json|ndjson`
- verification flow:
  - validate commit/link integrity
  - validate trust/signature policy
  - replay receipts
  - compare with referenced data commits

**Deterministic Tamper Tests:**

- ref rollback to older commit -> TAMPERED
- broken parent chain -> BROKEN_CHAIN
- mismatched dataCommit metadata -> DATA_MISMATCH
- swapped receipt blob in tree -> DATA_MISMATCH

**Performance Budget:** verify 10k commits < 5s p95 under declared benchmark profile

**Definition of Done:** BATS + fixture tests pass; machine-readable output schema documented

**Estimate:** 10-14 hours

### M4.T2.DOCTOR (B-Tier)

- **Status:** `DONE`

**User Story:** As an operator, I need one command that identifies likely system breakage fast.

**Requirements:**

- command: `git warp doctor`
- checks:
  - stale refs
  - missing objects
  - clock skew risk
  - auth misconfig
  - audit/data divergence signals
- output:
  - human summary + JSON mode

**Acceptance Criteria:** known-bad fixtures are correctly diagnosed

**Definition of Done:** README + troubleshooting linked; ops runbook includes doctor output interpretation

**Estimate:** 4-6 hours

---

## Milestone 5 — CLI DECOMPOSITION (A-Tier)

**Theme:** Maintainability
**Objective:** Prevent monolith drag on future features.

### M5.T1.COMMANDS SPLIT

- **Status:** `DONE`

**Requirements:**

- split `bin/warp-graph.js` into command modules
- `register(program)` per command
- complexity budget enforced by lint

**Acceptance Criteria:** entrypoint < 300 LOC; full regression suite green

**Definition of Done:** docs for contributor command architecture added

**Estimate:** 10-14 hours

---

## Milestone 6 — SAFE ERGONOMICS (B-Tier, replaces risky feature)

### M6.T1.PATCH-WRAPPER — Single Await API

- **Status:** `DONE`

**User Story:** As a developer, I want one-await mutation ergonomics without changing concurrency semantics.

**Requirements:**

- add `await graph.patch(fn, opts?)`
- internally:
  - `p = await createPatch()`
  - execute callback
  - `await p.commit()`
- explicitly preserve existing Lamport/ref ordering semantics
- typed errors for callback/commit failures
- forbid or define nested patch behavior

**Acceptance Criteria:**

- one-await UX works
- concurrency outcomes identical to legacy two-await flow
- no regressions in multi-writer tests

**Definition of Done:** docs include "convenience wrapper, no semantic changes"; examples and migration snippet added

**Estimate:** 4-6 hours

---

## Release Gates (Hard)

No v2.0 tag until **every** gate passes. If any RG fails: no tag. Period.

### Prior milestone gates (M1–M6)

1. M1.T1 security suite + replay fuzz + metrics checks
2. M3.T0 spec vectors implemented and passing
3. M3.T1 stress budget passed (RSS + correctness)
4. M4.T1 deterministic tamper suite fully green
5. rollback drill executed for audit feature flag
6. benchmark reports committed with environment disclosure

### Trust release gates (M7)

| Gate | Proof Obligation | Hard Fail Condition |
|------|-----------------|---------------------|
| **RG-T1** Persistence Determinism | Same record set + same ordering input → identical canonical outputs + digests | Any digest drift across replays |
| **RG-T2** Trust Evaluation Correctness | Allow/deny/revoke matrix passes for key lifecycle fixtures | Any incorrect verdict on known fixture |
| **RG-T3** Crypto Roundtrip | canonical → hash → sign → verify passes; tamper cases fail | Any false-accept or false-reject |
| **RG-T4** Chain Integrity | Missing/altered/interleaved records detected with actionable error codes | Silent acceptance of corrupted chain |
| **RG-T5** Mode Safety | off/warn/enforce semantics match spec; warn emits diagnostics without denial | Enforce behavior in warn mode, or silent bypass in enforce mode |
| **RG-T6** Migration Safety | Pre-v2 repos handled via documented path; no silent trust bypass | Undefined behavior on pre-v2 repo without explicit operator action |
| **RG-T7** CLI/API Parity | Identical verdict + reason codes for equivalent inputs via programmatic and CLI paths | Divergent verdicts between API and CLI for same input |
| **RG-T8** Operator Readiness | Docs cover install, bootstrap, verify, rotate, revoke, incident fallback | Any undocumented operator-facing workflow |

---

## Quality Bar (Mandatory)

- branch coverage threshold (not vanity 100%)
- mutation testing for verifier-critical logic
- invariant/property tests for chain semantics
- chaos tests for delayed commits / racey interleavings where applicable
- CI matrix across supported Node + Git versions

---

## Milestone 7 — TRUST V1: CRYPTOGRAPHIC IDENTITY-BACKED TRUST

**Theme:** Signed evidence, key bindings, monotonic revocation
**Objective:** Writer trust derived from signed records + active key bindings + revocation state. No unsigned trust decisions.

> **Do not merge until writer trust is derived from signed records + active key bindings + revocation state.**

### Phase 0 — ADR + Schema Lock (1 day)

- **Status:** `DONE`

**Deliverables:**

- `docs/specs/TRUST_V1_CRYPTO.md` — full spec (record schema, reason codes, verdict mapping, canonical serialization, evaluation algorithm)
- `src/domain/trust/reasonCodes.js` — frozen reason code registry
- `src/domain/trust/schemas.js` — Zod schemas for record envelope, policy, assessment output
- `src/domain/trust/canonical.js` — domain separation constants + unsigned record helpers
- `src/domain/trust/verdict.js` — deterministic verdict derivation

**Acceptance Criteria:** schemas + reason codes frozen before any implementation code.

### Phase 1 — Crypto Plumbing (2 days)

- **Status:** `DONE`

**Deliverables:**

- `src/domain/trust/TrustCrypto.js` — Ed25519 signature verify, key fingerprint computation
- `src/domain/trust/TrustCanonical.js` — canonical bytes for recordId + signing
- Extend `TrustError` codes for signature/record failures

**Test classes:**

- Known-good signature verify
- Tamper detection (mutated payload/signature/issuerKeyId)
- keyId fingerprint integrity (KEY_ADD keyId must match fingerprint of publicKey)
- Unsupported algorithm rejection
- Deterministic recordId computation

### Phase 2 — Trust Record Store + Parser (2 days)

- **Status:** `DONE`

**Deliverables:**

- `src/domain/trust/TrustRecordService.js` — appendRecord, readRecords, verifyRecordSignature
- Trust record ref at `refs/warp/<graph>/trust/records`
- ~~B15~~ Chain integration test (append, read-back, chain integrity under `refs/warp/<graph>/trust/records`)
- ~~B23~~ Sign+verify round-trip test (canonical → hash → sign → verify pipeline end-to-end)
- Golden canonical fixtures: freeze expected digests for known record inputs before Phase 3

**Test classes:**

- Genesis constraints (first record prev=null)
- Prev-link consistency
- Duplicate recordId detection
- Pinned read strictness
- Order determinism (different retrieval order → same evaluated state)
- Chain integrity: append N records → read back → verify prev-links + digests match golden fixtures
- Crypto round-trip: `computeSignaturePayload()` → `node:crypto.sign()` → `TrustCrypto.verifySignature()` passes; mutated payload fails

### Phase 3 — State Builder + Evaluator (2 days)

- **Status:** `DONE`

**Deliverables:**

- `src/domain/trust/TrustStateBuilder.js` — buildState(records) → { activeKeys, revokedKeys, writerBindings, revokedBindings, errors }
- `src/domain/trust/TrustEvaluator.js` — evaluateWriters(writerIds, trustState, policy) → TrustAssessment

**Test classes:**

- Key lifecycle (KEY_ADD → active, KEY_REVOKE → inactive)
- Binding lifecycle (WRITER_BIND_ADD → trusted, WRITER_BIND_REVOKE → untrusted)
- Monotonic revocation (revoked key cannot validate future bindings)
- Deterministic ordering (shuffled writer input → same sorted output)
- Reason code completeness (every explanation has machine-readable reasonCode)
- Policy strictness (unknown policy → fail)

**Adversarial test class (required — if not green, "trust" is marketing copy):**

- Tampered trust record injected mid-chain → detected, actionable error code
- Stale key presented as active after KEY_REVOKE → denied
- Revoked key used to sign new binding after revocation tick → rejected
- Out-of-order record replay attempt → deterministic result (same verdict regardless of arrival order)
- Forged issuerKeyId (keyId does not match fingerprint of supplied publicKey) → rejected

### Phase 4 — CLI + Verifier Integration (2 days)

- **Status:** `DONE`

**Deliverables:**

- `bin/cli/commands/trust.js` — key add/revoke, bind add/revoke, show, doctor
- `AuditVerifierService.evaluateTrust()` backed by signed evidence
- `trustSchemaVersion` + `mode` in output contract
- Pin resolution at CLI boundary (flag > env > ref)

**Test classes:**

- CLI pin precedence matrix (flag only, env only, both, neither)
- Exit code matrix (integrity fail, trust fail in enforce mode, not_configured with --trust-required)
- JSON contract lock (full schema validation on CLI JSON output)

### Phase 5 — Hardening + Migration (1–2 days)

- **Status:** `DONE`

**Deliverables:**

- Full JSON contract snapshot tests
- Migration doc from allowlist model
- Operator runbook (install, bootstrap, verify, rotate, revoke, incident fallback)
- Threat model section
- Explicit rollout modes: off / warn / enforce
- Schema + canonicalization hash freeze: golden fixtures with pinned expected digests (any post-tag hash drift = ecosystem pain)

**Hard rollback rule:** if enforce-mode produces any false deny on known-good fixtures, auto-fallback to warn-mode. Document exact operator command/flag for rollback. No vibes-based rollback during incident response.

**Cross-mode receipt determinism:** same input must produce identical receipts across warn/enforce modes.

**Release gate:** all test classes from Phases 1–4 passing (including adversarial suite), output schema locked, golden fixtures frozen, boundary purity checks green, no-coordination regression suite green.

---

## Milestone 8 — IRONCLAD

**Theme:** Type safety
**Objective:** Stabilize the declaration surface, eliminate untyped casts, lock it with CI.
**Triage date:** 2026-02-17

### M8 Phase 1 — Declaration Fix + Boundary Validation

- **Status:** `DONE`

**Items:**

- **B29** (`index.d.ts` TYPE FIXES) — `createPatch()` returns `Promise<PatchSession>` not `Promise<unknown>`; `logNodes` format optional; `materialize()`/`syncCoverage()`/`materializeAt()` return proper types. Unblocks all downstream TS consumers (#35).
- **B38** (DENO AMBIENT TYPE DECLARATION) — add `globals.d.ts` declaring `Deno` as an ambient type; eliminates scattered `@ts-expect-error` annotations.
- **B14** (`HttpSyncServer` CONFIG VALIDATION LAYER) — Zod schema for constructor options; catch impossible/contradictory combos at construction time. Pulled forward from M10: validates the boundary *before* M9 refactors move code behind it.

### M8 Phase 2 — Cast Elimination

- **Status:** `DONE`

**Items:**

- **B30** (`any` CAST CLEANUP + `WarpPersistence` TYPE) — define `WarpPersistence` union type covering all 5 persistence ports; replace 161+ `any` casts in `src/` with validated types.

**Acceptance:** `grep -rE '@type \{(\*|any)\}' src/` returns zero.

### M8 Phase 3 — Declaration Automation

- **Status:** `DONE`

**Items:**

- **B41** (DECLARATION SURFACE VALIDATOR) — `scripts/check-dts-surface.js` validates `index.d.ts` against the `type-surface.m8.json` manifest and `index.js` runtime exports. Catches drift when exports are added/removed without updating declarations or manifest.
- **B42** (CI `.d.ts` SIGNATURE VALIDATION + CONSUMER EXPANSION) — Consumer type test (`test/type-check/consumer.ts`) expanded to cover full API surface per manifest: sync protocol, serve, fork, wormhole, GC, provenance, Writer lifecycle, standalone functions (BTR, wormhole, type creators, tick receipts, migration), class constructors (InMemoryGraphAdapter, GitGraphAdapter, BitmapIndexBuilder/Reader, ProvenancePayload, HealthCheckService), getters/setters, and 6 negative `@ts-expect-error` cases. CI Gate 5 runs the surface validator.

**M8 Gate:** `.d.ts` CI green; zero `any` casts; B28 compile-only stub passes (`tsc --noEmit` on minimal TS consumer).

---

## Milestone 9 — PARTITION

**Theme:** Architectural decomposition
**Objective:** Break apart the god class and eliminate structural DRY violations before adding feature mass.
**Triage date:** 2026-02-17

### M9.T1 — SyncController Extraction

- **Status:** `PENDING`

**Items:**

- **B33** (WARPGRAPH SYNCCONTROLLER EXTRACTION) — move `syncWith`, `serve`, `processSyncRequest` from `WarpGraph.js` into `SyncController.js`; reduces god class by ~800 LOC; isolates network concerns from graph concerns.

### M9.T2 — JoinReducer Dual-Path Refactor

- **Status:** `PENDING`

**Items:**

- **B32** (JOINREDUCER DUAL-PATH REFACTOR) — split `join()` into `applyFast(state, patch)` and `applyWithReceipt(state, patch)` strategy pair; eliminates DRY violation where new op types in fast path can be missed in receipt path.

### M9.T3 — Bitmap OID Validation (Opportunistic)

- **Status:** `PENDING`

**Items:**

- **B31** (BITMAP INDEX OID VALIDATION) — add strict OID validation pass in `BitmapIndexReader.setup()`. Bundle if touching bitmap internals during decomposition.

**M9 Gate:** WarpGraph LOC < 500; no-coordination regression suite green; LOC/complexity delta documented; behavior parity tests for extracted modules.

---

## Milestone 10 — SENTINEL

**Theme:** Trust hardening + sync safety
**Objective:** Complete the signed trust boundary. Design the causality bisect spec.
**Triage date:** 2026-02-17

### M10.T1 — Signed Sync Ingress

- **Status:** `PENDING`

**Items:**

- **B1** (STRICT PROVENANCE) — enforced signed commits for sync ingress. Writer whitelist done (v11.0.0); this completes the remaining trust boundary.

### M10.T2 — Trust Reliability

- **Status:** `PENDING`

**Items:**

- **B39** (TRUST RECORD CAS RETRY) — retry-once semantics for `compareAndSwapRef` failures in `TrustRecordService._persistRecord`; mirrors the `AuditReceiptService` pattern.
- **B40** (BATS E2E: `git warp trust` OUTPUT SHAPES) — integration tests for JSON output schema, exit codes, and `not_configured` default behaviour.

### M10.T3 — Causality Bisect Spec

- **Status:** `PENDING`

**Items:**

- **B2 (spec only)** (CAUSALITY BISECT) — design the bisect CLI contract + data model. Commit spec with test vectors. Full implementation deferred to M11 — but the spec lands here so bisect is available as a debugging tool during M10 trust hardening.

**M10 Gate:** Signed ingress enforced end-to-end; trust E2E receipts green; B2 spec committed with test vectors.

---

## Milestone 11 — COMPASS II

**Theme:** Developer experience
**Objective:** Ship bisect, public observer API, and batch patch ergonomics.
**Triage date:** 2026-02-17

### M11.T1 — Causality Bisect (Implementation)

- **Status:** `PENDING`

**Items:**

- **B2 (implementation)** (CAUSALITY BISECT) — full implementation building on M10 spec. Binary search for first bad tick/invariant failure. `git bisect` for WARP.

### M11.T2 — Observer API

- **Status:** `PENDING`

**Items:**

- **B3** (OBSERVER API) — public event contract. Internal soak period over (shipped in PULSE, used internally since). Stabilize the public surface.

### M11.T3 — Batch Patch API

- **Status:** `PENDING`

**Items:**

- **B11** (`graph.patchMany(fns)` BATCH API) — sequence multiple patch callbacks atomically, each seeing the ref left by the previous. Natural complement to `graph.patch()`.

**M11 Gate:** Bisect correctness verified on seeded regressions; observer contract snapshot-tested; patchMany passes no-coordination suite.

---

## Standalone Lane (Ongoing)

Items that can be picked up opportunistically without blocking anything. No milestone assignment.

### Immediate (tiny changes)

| ID | Item |
|----|------|
| B46 | **ESLINT BAN `Date.now()` IN DOMAIN** — one-line `no-restricted-syntax` config change |
| B47 | **`orsetAdd` DOT ARGUMENT VALIDATION** — domain boundary validation, prevents silent corruption |
| B26 | **DER SPKI PREFIX CONSTANT** — named constant with RFC 8410 reference |

### Near-Term

| ID | Item |
|----|------|
| B44 | **SUBSCRIBER UNSUBSCRIBE-DURING-CALLBACK E2E** — event system edge case; known bug class that bites silently |
| B34 | **DOCS: SECURITY_SYNC.md** — extract threat model from JSDoc into operator doc |
| B35 | **DOCS: README INSTALL SECTION** — Quick Install with Docker + native paths |
| B36 | **FLUENT STATE BUILDER FOR TESTS** — `StateBuilder` helper replacing manual `WarpStateV5` literals |
| B37 | **SHARED MOCK PERSISTENCE FIXTURE** — dedup `createMockPersistence()` across trust test files |
| B43 | **VITEST EXPLICIT RUNTIME EXCLUDES** — prevent accidental local runs of Docker-only suites |
| B12 | **DOCS-VERSION-SYNC PRE-COMMIT CHECK** — grep version literals in .md files against `package.json` |
| B48 | **ESLINT BAN `= {}` CONSTRUCTOR DEFAULTS WITH REQUIRED PARAMS** — catches the pattern where `= {}` silently makes required options optional at the type level (found in CommitDagTraversalService, DagTraversal, DagPathFinding, DagTopology, BitmapIndexReader) |
| B49 | **TIGHTEN `checkDeclarations` INLINE COMMENT STRIPPING** — strip trailing `//` and `/* */` comments before checking for `any` in `ts-policy-check.js`; low priority but closes theoretical false-positive gap |
| B50 | **ALIGN `type-surface.m8.json` WITH `index.d.ts`** — `syncWith` return missing `state?: WarpStateV5`, `setSeekCache` method missing entirely; manifest is declared source of truth for T3/T9 consumer tests |
| B51 | **AUDIT REMAINING `= {}` CONSTRUCTOR DEFAULTS** — DagTraversal, DagPathFinding, DagTopology, BitmapIndexReader all have same compile-time safety gap as CommitDagTraversalService (fixed in 0cead99); remove defaults, add `@ts-expect-error` to negative tests |
| B52 | **FIX OUTSIDE-DIFF IRONCLAD REVIEW ITEMS** — TickReceipt `sortedReplacer` wildcards (`{[x: string]: *}`), verify-audit.js `@returns {payload: *}`, SyncAuthService `keys` optional JSDoc |
| B53 | **FIX JSR PUBLISH DRY-RUN DENO PANIC** — Deno 2.6.7 `deno_ast` panics on overlapping text changes from duplicate `roaring` import rewrites; either pin Deno version, vendor the import, or file upstream issue and add workaround |
| B54 | **`typedCustom()` ZOD HELPER** — `z.custom()` without a generic yields `unknown` in JS; a JSDoc-friendly wrapper (or `@typedef`-based pattern) would eliminate verbose `/** @type {z.ZodType<T>} */ (z.custom(...))` casts across HttpSyncServer and future Zod schemas |
| B55 | **UPGRADE `HttpServerPort` REQUEST/RESPONSE TYPES** — `createServer` callback uses `Object` for `headers` and `string|Buffer` for response body; tighten to `Record<string, string>` and extract shared request/response typedefs to avoid repeated inline casts in HttpSyncServer, NodeHttpAdapter, BunHttpAdapter, DenoHttpAdapter |
| B56 | **INVESTIGATE `observedFrontier` / FRONTIER SEMANTIC MISMATCH** — `sync.methods.js` line 261 double-casts `observedFrontier` (a version vector `Map<string, number>`) to `Map<string, string>` (writer frontier) before passing to `applySyncResponseImpl`; determine whether this is a latent correctness bug or an intentional coercion, and fix or document accordingly |
| B57 | **CI: AUTO-VALIDATE `type-surface.m8.json` AGAINST `index.d.ts`** — add a CI gate or pre-push check that parses the manifest and confirms every declared method/property/return type matches the corresponding signature in `index.d.ts`; prevents drift like the missing `setSeekCache` and `syncWith.state` return found in review |

### Conformance Property Pack (B19 + B22)

Single lightweight property suite — not a milestone anchor:

- **B19** (CANONICAL SERIALIZATION PROPERTY TESTS) — fuzz `canonicalStringify`; verify idempotency, determinism, round-trip stability.
- **B22** (CANONICAL PARSE DETERMINISM TEST) — verify `canonicalStringify(TrustRecordSchema.parse(record))` produces identical output across repeated calls.

**Rationale:** Golden fixtures test known paths; property tests test unknown edge combinations. For a deterministic engine, this is not optional forever. Trimmed to a single file covering canonical serialize idempotence + order-invariance.

### Post-M8 Stub

- **B28** (PURE TYPESCRIPT EXAMPLE APP) — 1-hour CI compile-only stub (`tsc --noEmit` on minimal TS consumer). Ships the day M8 Phase 1 merges. Full app deferred until M8 complete.

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

---

## Rejected (see GRAVEYARD.md)

B5, B6, B13, B17, B18, B25, B45 — rejected 2026-02-17 with cause recorded in `GRAVEYARD.md`.

---

## Completed Backlog Items

| ID | Status |
|----|--------|
| B8 | ~~DONE~~ `readRef` dangling-ref resilience |
| B9 | ~~DONE~~ `graph.patch()` integration test |
| B10 | ~~DONE~~ `Writer.commitPatch()` reentrancy guard |
| B15 | ~~PROMOTED TO M7 PHASE 2~~ trust record chain integration test |
| B23 | ~~PROMOTED TO M7 PHASE 2~~ trust sign+verify integration test |
| B24 | ~~DONE (daf4adb)~~ audit try/catch without `expect.assertions` |

---

## Execution Order

### v2.0 milestones (M1–M7): COMPLETE

1. M1.T1 → M2.T1 + M2.T2 → M3.T0 → M3.T1 → M4.T1 → M5.T1 → M4.T2 → M6.T1 → M2.T3 → M1.T2 → M7

### Post-v2.0 milestones (M8–M11): LOCKED

1. **M8 IRONCLAD** — Type safety (B29, B38, B14 → B30 → B41, B42)
2. **M9 PARTITION** — Decomposition (B33, B32, B31)
3. **M10 SENTINEL** — Trust + sync safety (B1, B39, B40, B2 spec)
4. **M11 COMPASS II** — Developer experience (B2 impl, B3, B11)

### Critical Path

```text
B29 ──→ B30 ──→ B41/B42 ──→ [M8 GATE] ──→ B33 ──→ [M9 GATE]
 │                                          B32 ──┘      │
 B38                                        B31(opt)      │
 B14                                                      ▼
                                            B1 ──→ [M10 GATE] ──→ B2(impl)
                                            B39 ──┘    │           B3
                                            B40 ──┘    │           B11
                                            B2(spec)───┘           ▼
                                                            [M11 GATE]
```

---

## Final Command

v2.0 shipped defensible, verifiable, and maintainable.

Post-v2.0 locks in type safety first, then decomposes, then hardens trust, then ships DX.
Every milestone has a hard gate. No milestone blurs into the next.

Rejected items live in `GRAVEYARD.md`. Resurrections require an RFC.
