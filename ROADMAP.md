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

No v2.0 tag until all pass:

1. M1.T1 security suite + replay fuzz + metrics checks
2. M3.T0 spec vectors implemented and passing
3. M3.T1 stress budget passed (RSS + correctness)
4. M4.T1 deterministic tamper suite fully green
5. rollback drill executed for audit feature flag
6. benchmark reports committed with environment disclosure

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

- **Status:** `IN PROGRESS`

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

- **Status:** `TODO`

**Deliverables:**

- `src/domain/trust/TrustRecordService.js` — appendRecord, readRecords, verifyRecordSignature
- Trust record ref at `refs/warp/<graph>/trust/records`

**Test classes:**

- Genesis constraints (first record prev=null)
- Prev-link consistency
- Duplicate recordId detection
- Pinned read strictness
- Order determinism (different retrieval order → same evaluated state)

### Phase 3 — State Builder + Evaluator (2 days)

- **Status:** `TODO`

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

### Phase 4 — CLI + Verifier Integration (2 days)

- **Status:** `TODO`

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

- **Status:** `TODO`

**Deliverables:**

- Full JSON contract snapshot tests
- Migration doc from allowlist model
- Operator runbook
- Threat model section
- Explicit rollout modes: off / warn / enforce

**Release gate:** all 10 test classes from spec section 18 passing, output schema locked, boundary purity checks green, no-coordination regression suite green.

---

## Backlog (Post-v2.0)

| ID | Tier | Idea |
|----|------|------|
| B1 | A | **STRICT PROVENANCE** — ~~writer whitelist done (v11.0.0)~~; enforced signed commits for sync ingress still open |
| B2 | A | **CAUSALITY BISECT** — binary search first bad tick/invariant failure |
| B3 | B | **OBSERVER API** — public event contract after internal soak |
| B4 | B | **WARP UI VISUALIZER** — local graph/audit explorer |
| B5 | D | **EXPERIMENTAL SYNC-BUILDER** — only behind explicit flag; requires invariants doc + soak + rollback proof; not eligible for core release without separate RFC |
| B6 | B/C | **RUST CORE / WASM** — pursue only when measured perf ceiling is proven in JS path |
| B7 | C | **DOCTOR: PROPERTY-BASED FUZZ TEST** — fuzz `writerHeads` with random null/empty shas and verify no check throws (all return findings) |
| B8 | B | ~~DONE~~ **`readRef` DANGLING-REF RESILIENCE** — `refExists` and `readRef` in `GitGraphAdapter` now catch exit 128 (dangling object) alongside exit 1 (missing ref), returning `null`/`false` instead of throwing |
| B9 | B | ~~DONE~~ **`graph.patch()` INTEGRATION TEST** — end-to-end tests with real Git persistence verifying CAS behavior (reentrancy guard, ref advancement, sequential patches) |
| B10 | C | ~~DONE~~ **`Writer.commitPatch()` REENTRANCY GUARD** — `commitPatch()` now has a `_commitInProgress` guard matching `graph.patch()` semantics |
| B11 | C | **`graph.patchMany(fns)` BATCH API** — sequence multiple patch callbacks atomically, each seeing the ref left by the previous; avoids reentrancy issue entirely and enables multi-patch workflows without dropping to `createPatch()` |
| B12 | C | **DOCS-VERSION-SYNC PRE-COMMIT CHECK** — grep for version literals in .md files and examples, compare against `package.json`; prevents migration guides referencing wrong versions |
| B13 | C | **ESLINT: NO-STRING-DUPLICATION** — custom rule or plugin to flag long error messages (>80 chars) appearing 3+ times; catches drift-prone copy-paste strings like `E_NO_STATE_MSG` before they're extracted |
| B14 | B | **`HttpSyncServer` CONFIG VALIDATION LAYER** — Zod-style schema validation for constructor options; catch impossible/contradictory combos (e.g. `allowedWriters` without `auth`, `maxRequestBytes < 0`) at construction time instead of silently misbehaving at runtime |
| B15 | B | **TRUST RECORD CHAIN INTEGRATION TEST** — end-to-end test for trust record storage under `refs/warp/<graph>/trust/records` (append, read-back, chain integrity) |
| B16 | C | **`unsignedRecordForId` EDGE-CASE TESTS** — deeply nested subjects, empty objects, arrays, Unicode keys, null values |
| B17 | C | **`TrustRecordSchema.strict()` VARIANT** — reject unknown keys in trust record envelope to catch schema drift early |
| B18 | C | **ZOD CONVENTION: TRIM BEFORE MIN** — add note to CLAUDE.md: always call `.trim()` before `.min()` on Zod string validators |
| B19 | C | **CANONICAL SERIALIZATION PROPERTY TESTS** — fuzz `canonicalStringify` with random nested objects; verify idempotency, determinism, and round-trip stability |
| B20 | C | **TRUST RECORD ROUND-TRIP SNAPSHOT TEST** — full cycle: parse → canonical → recordId → signaturePayload → verify; snapshot the intermediate outputs |
| B21 | B | **TRUST SCHEMA DISCRIMINATED UNION** — migrate `TrustRecordSchema` from `superRefine` write-back to Zod discriminated union; eliminates mutation in refinement, gives type-safe per-recordType subject schemas natively |
| B22 | C | **CANONICAL PARSE DETERMINISM TEST** — verify `canonicalStringify(TrustRecordSchema.parse(record))` produces identical output across repeated parse calls; guards against non-deterministic transform ordering |
| B23 | B | **TRUST SIGN+VERIFY INTEGRATION TEST** — round-trip test: sign a record with `computeSignaturePayload()` + `node:crypto.sign()`, then verify through `TrustCrypto.verifySignature()`; validates the full canonical→hash→sign→verify pipeline end-to-end |
| B24 | C | **AUDIT TRY/CATCH WITHOUT `expect.assertions`** — scan all test files for try/catch blocks that lack `expect.assertions()`; fix silent-pass risks where catch is the only assertion path |
| B25 | C | **ESLINT: TEST CATCH-BLOCK ASSERTION GUARD** — custom ESLint rule or vitest plugin to flag try/catch blocks in test files that contain `expect()` calls only inside `catch` without a preceding `expect.assertions()` |
| B26 | C | **DER SPKI PREFIX CONSTANT** — extract the Ed25519 DER SPKI prefix (`302a300506032b6570032100`) in `TrustCrypto.js` to a named constant with an RFC 8410 reference comment |
| B27 | B | **`TrustKeyStore` PRE-VALIDATED KEY CACHE** — Phase 2+ module that validates and caches Ed25519 public keys at import time (base64 decode + length check + `createPublicKey`) so `verifySignature` skips per-call key parsing |

---

## Execution Order (Optimized)

1. M1.T1
2. M2.T1 + M2.T2
3. M3.T0
4. M3.T1
5. M4.T1
6. M5.T1
7. M4.T2
8. M6.T1
9. M2.T3 + doc polish if capacity remains
10. M1.T2 triage refinements in parallel where possible

---

## Final Command

This cut gives you a v2.0 that is:

- defensible,
- verifiable,
- maintainable,
- and not booby-trapped by unnecessary concurrency heroics.

If dissenters insist on shoving risky sync-builder into v2.0 anyway: they can file an RFC and wait in line.
