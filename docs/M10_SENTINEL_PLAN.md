# M10 SENTINEL — Implementation Plan (Updated)

> Incorporates all MUST/SHOULD/COULD/DON'T feedback from review.

## Context

M10 closes the remaining trust boundary gaps: unsigned sync ingress, unreliable trust persistence, missing payload validation, silent divergence swallowing, and a GC race condition. Also delivers the causality bisect spec (implementation deferred to M11).

**Gate:** Signed ingress enforced end-to-end; trust E2E green; B63 GC isolation verified under concurrent writes; B64 sync payload validation green; B65 divergence logging verified; B2 spec committed with test vectors.

---

## Execution Order

```text
Wave 1 (independent, parallelizable):
  B65  Sync divergence logging         [small, low risk]
  B39  Trust CAS retry                 [small, medium risk]
  B2   Causality bisect spec           [medium, low risk — spec only]

Wave 2 (sync + GC hardening):
  B64  Sync payload validation         [medium, medium risk]
  B63  GC snapshot isolation           [medium, high risk]

Wave 3 (integration, depends on B64 + B39):
  B1   Signed sync ingress             [large, high risk]
  B40  BATS E2E for trust             [medium, low risk]
```

---

## Wave 1

### B65 — Sync Divergence Logging

**Problem:** `SyncProtocol.js:415-422` — `E_SYNC_DIVERGENCE` caught and silently `continue`d.

**Approach:** Add optional `logger` param (default `nullLogger`) to `processSyncRequest()`. In the catch block, call `logger.warn()` with stable event code and full debug context before `continue`.

**Log payload (MUST):**
- `code: 'E_SYNC_DIVERGENCE'` (stable event code)
- `writerId`, `localSha`, `remoteSha`, `graphName`

**Files:**
- `src/domain/services/SyncProtocol.js` — add logger param, emit warn
- `src/domain/services/SyncController.js` — thread `this._host._logger` into call

**Tests:** Unit test with mock logger; force `E_SYNC_DIVERGENCE`, assert `logger.warn` called with correct fields.

---

### B39 — Trust CAS Retry

**Problem:** `TrustRecordService._persistRecord()` (line 277) — single CAS, no retry. Concurrent appenders fail permanently.

**Corrected approach (from review):**

Trust records are pre-signed by the caller. The `recordId` is content-addressed from record content (which includes `prev`). The `signature` covers the record content. Therefore we **cannot silently rebase** a record inside `_persistRecord()` — changing `prev` would invalidate both `recordId` and `signature`.

**Algorithm:**
1. Build commit (blob + tree + Git commit with parent=`parentSha`)
2. Attempt CAS update with expected `parentSha`
3. On CAS failure:
   a. Read fresh tip SHA
   b. If fresh tip == expected parent → **transient failure** (lock contention, I/O race). Retry CAS with same commit (up to N=3 total attempts).
   c. If fresh tip != expected parent → **real concurrent append**. The chain advanced. Our record's `prev` no longer matches the chain tip. Throw `E_TRUST_CAS_CONFLICT` with `actualTipSha` + `actualTipRecordId` so the caller can rebuild, re-sign, and retry.
4. After N=3 transient retries exhausted → throw `E_TRUST_CAS_EXHAUSTED`.

**Why not silent rebase:** The record's `prev`, `recordId`, and `signature` form a cryptographic chain. Only the original signer can rebuild. Silently rebasing would produce "a trust log that looks valid but isn't."

**Error codes:**
- `E_TRUST_CAS_CONFLICT` — real concurrent append; caller must rebuild record
- `E_TRUST_CAS_EXHAUSTED` — transient CAS failures exhausted retry budget

**Files:**
- `src/domain/trust/TrustRecordService.js` — add retry loop in `_persistRecord()`

**Tests:**
- Transient CAS failure (ref unchanged): first CAS throws, retry succeeds
- Transient CAS exhausted: all 3 attempts fail → `E_TRUST_CAS_EXHAUSTED`
- Real conflict (ref changed): CAS throws + ref advanced → `E_TRUST_CAS_CONFLICT` with new tip info
- Happy path unchanged

---

### B2 — Causality Bisect Spec

**Problem:** No bisect capability. M10 delivers spec + test vectors only.

**Corrections from review (MUST):**
- Add "correctness contract" section: what property makes bisect valid in a DAG? Monotonicity along the chosen order is not automatic in multi-writer DAGs.
- Scope V1 to linearizable ranges. General DAG bisect is best-effort.
- Replace "topological sort + binary search" with "candidate that roughly halves remaining candidate set by reachability" (git-style bisect by commit weight), or explicitly constrain to single chain/mainline.

**Contents:**
- **CLI contract:** `git warp bisect --graph <name> --good <sha> --bad <sha> --test <command>`
- **Data model:** `BisectState { good, bad, candidates, current, steps }`
- **Algorithm:** V1 — linearized single-chain bisect. Multi-writer DAG bisect = best-effort with weight-based candidate selection.
- **Correctness contract:** Monotonicity requirement + what happens when it doesn't hold
- **Infrastructure reuse:** `DagTopology.topologicalSort()`, `DagTraversal.ancestors()`, `isReachable()`
- **Exit codes:** 0 = found, 1 = usage, 2 = range error, 3 = internal
- **Test vectors:** 6 scenarios (linear, multi-writer, already-good, already-bad, single-step, diamond)

**Files:**
- `docs/specs/BISECT_V1.md` — new spec document

---

## Wave 2

### B64 — Sync Payload Validation

**Problem:** `CborCodec.decode()` is raw cbor-x passthrough. Malformed payloads reach `join()`.

**Corrections from review (MUST):**
- Include DoS caps (not just shape): max patches, max ops per patch, max string/blob bytes, max writers in frontier
- Handle Map vs plain object (cbor-x decodes maps)
- Validate both directions (inbound server request + inbound client response)
- Don't skip validation for direct-peer path without assertion. Either validate always, or assert invariants in apply path.
- Mutation tripwire: snapshot state hash before applying response; on validation fail assert hash unchanged

**Approach:**
1. Create `src/domain/services/SyncPayloadSchema.js` with Zod schemas for `SyncRequest` and `SyncResponse`
   - Shape validation (type discriminator, frontier object, patches array, per-patch shape)
   - Resource limits (configurable caps with sane defaults)
   - Schema versioning: embed `schemaVersion` field, accept v1, reject unknown
2. Validate in `SyncController` after HTTP response parse, before `applySyncResponse()`. Throw `E_SYNC_PAYLOAD_INVALID` on failure.
3. Replace `HttpSyncServer.isValidSyncRequest()` with Zod-based `SyncRequestSchema.safeParse()`
4. For direct-peer path: validate with assertion (not skip)

**Files:**
- New: `src/domain/services/SyncPayloadSchema.js`
- `src/domain/services/SyncController.js` — validate inbound HTTP response
- `src/domain/services/HttpSyncServer.js` — replace `isValidSyncRequest()` with Zod

**Tests:**
- Unit tests for schema (valid passes, incrementally malformed fails)
- Resource limit tests (oversized arrays rejected)
- Map vs object normalization
- Integration: mock server returns invalid shape → `E_SYNC_PAYLOAD_INVALID`, no state mutation
- Golden CBOR vectors: fixture set of encoded CBOR payloads (valid/invalid)

---

### B63 — GC Snapshot Isolation

**Problem:** `executeGC()` is pure, but callers in `checkpoint.methods.js` don't verify that no concurrent writes happened during compaction. A writer committing between `appliedVV` capture and `orsetCompact()` can lose tombstones.

**Corrections from review (MUST):**
- Stage side effects: GC should produce compacted state without writing it. Only after "frontier unchanged" check passes do we swap it in.
- `executeGC()` stays pure (already is — it mutates a state object in-place, but callers can clone first)
- Define frontier equality: deep equality with sorted keys via `frontierFingerprint()` helper
- Deterministic concurrency tests: internal barrier/hook so tests can force "commit happens between snapshot and compact" without timing races

**Approach:**
- **`_maybeRunGC()`** (auto-GC, best-effort):
  1. Clone `_lastFrontier` before GC
  2. Clone `_cachedState` before GC (so executeGC doesn't mutate the live state)
  3. Run `executeGC()` on the clone
  4. After GC, re-read current frontier. Compare fingerprints.
  5. If unchanged → swap cloned state into `_cachedState`
  6. If changed → discard clone, mark dirty, log warning. No throw.

- **`runGC()`** (explicit API):
  1. Same clone + snapshot pattern
  2. If frontier changed → throw `E_GC_STALE` so caller can retry
  3. If unchanged → swap in compacted state

**`frontierFingerprint()` helper:** Sort keys, JSON-stringify `[[k1,v1],[k2,v2],...]`, return hex SHA-256 or stable string. Used in B63 and in divergence logs.

**Files:**
- `src/domain/warp/checkpoint.methods.js` — frontier snapshot + clone-then-swap in both call sites
- `src/domain/services/Frontier.js` — add `frontierFingerprint()` helper
- `src/domain/errors/` — `E_GC_STALE` error code (in existing error classes)

**Tests:**
- Unit: mock `_lastFrontier` changing mid-GC, verify dirty flag set / error thrown
- Deterministic: add `_gcBarrier` hook; test injects barrier that forces frontier change during GC; verify isolation triggers
- Integration: two writers, concurrent commit during GC, verify isolation

---

## Wave 3

### B1 — Signed Sync Ingress

**Problem:** No server-side verification that incoming sync requests carry valid signatures. `SyncAuthService` has signing + verification but it's not enforced at the HTTP boundary. Writer whitelist extraction in `_authorize()` inspects `parsed.patches` (wrong for sync-requests which have `frontier`). Trust evaluation not integrated.

**Corrections from review (MUST):**

**Order of operations:**
1. Decode (with size limits — already done via `maxRequestBytes`)
2. Schema validate (B64's Zod schema)
3. Verify signature
4. Extract identity + writers being applied
5. Trust evaluate
6. Apply

**Who is being trusted (MUST clarify):**
- `writersApplied` = writers from `patches` in sync response (the actual data being ingested)
- `writersReferenced` = keys from `frontier` (claims, for policy/rate limiting only)
- Trust-gate on `writersApplied`, NOT solely on frontier keys
- If request authenticates a peer, also trust-gate the peer identity

**Fix writer ID extraction in `_authorize()`:**
- For sync-requests: extract writer IDs from `frontier` keys for reference, BUT
- The actual trust gate should be on patch authors if patches are present (sync-response being applied)
- For incoming sync-requests to the server, the server is GENERATING the response — it doesn't ingest patches from the request

**Domain separation (MUST add if not present):**
- Include protocol/version/graphName in signature payload to prevent cross-protocol replay

**Files:**
- `src/domain/services/HttpSyncServer.js` — fix `_authorize()`, integrate trust evaluation, correct writer extraction
- `src/domain/services/SyncController.js` — extend `serve()` options with trust config; validate inbound patches by writer identity
- New: `src/domain/services/SyncTrustGate.js` — encapsulate trust-check logic (evaluate writer list against TrustEvaluator)

**Tests:**
- Unit: writer IDs from patches (not frontier), allowed/forbidden writers, trust enforce/log-only modes
- Unit: unsigned request rejected (401/403), malformed signature rejected, trusted signed request accepted
- Integration: two graphs with auth, signed sync succeeds; untrusted writer rejected

---

### B40 — BATS E2E for Trust

**Problem:** No E2E CLI tests for `git warp trust`.

**Test cases (MUST):**
1. No trust records → exit 0, `trustVerdict: "not_configured"`
2. Valid trust chain → exit 0, `trustVerdict: "pass"`
3. `--mode enforce` + untrusted writer → exit 4
4. `--mode warn` + untrusted writer → exit 0
5. `--trust-pin <sha>` → `source: "cli_pin"`
6. `WARP_TRUST_PIN=<sha>` → `source: "env_pin"`
7. `--json` output shape validation
8. Unsigned request rejected (401/403) — signed ingress enforcement
9. Malformed signature rejected
10. Trusted signed request accepted

**Unified error code → HTTP status mapping:**
- payload invalid → 400/422
- auth failed → 401
- untrusted → 403
- internal → 500

**Files:**
- New: `test/bats/cli-trust.bats`
- New: `test/bats/helpers/seed-trust.js`

---

## Cross-Cutting Concerns

### Metrics counter hooks (SHOULD)

Thin adapter pattern for operational counters:
- `sync_payload_invalid_total`
- `sync_divergence_total`
- `gc_stale_total`
- `trust_cas_conflict_total`

### Frontier fingerprint helper (MUST for B63, useful everywhere)

```javascript
// src/domain/services/Frontier.js
export function frontierFingerprint(frontier) {
  const sorted = [...frontier.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return JSON.stringify(sorted);
}
```

### Trust gate decision record (SHOULD)

When `trustMode` is `warn`, emit a one-line "decision" log with verdict + reason chain (pin source, evaluator result).

---

## DON'T (from review)

- Don't ship B39 as "commit-only rebase" if the record content/signature depends on prev. ✓ Fixed: throw `E_TRUST_CAS_CONFLICT`, caller rebuilds.
- Don't trust-gate solely on frontier keys. ✓ Fixed: gate on `writersApplied` from patches.
- Don't rely on timing-based concurrency tests. ✓ Fixed: use deterministic barrier/hook pattern.
- Don't skip validation for "internal" paths without invariant assertions.

---

## Verification

After all items:
1. `npm run test:local` — all 4270+ unit tests pass
2. `npm run lint` — clean
3. Docker BATS: `docker compose -f docker-compose.test.yml run --rm test-node22` — trust BATS green
4. Manual: two repos with auth + trust configured, sync succeeds for trusted writer, rejects untrusted
5. `npm run release:preflight` — all checks pass before tagging
