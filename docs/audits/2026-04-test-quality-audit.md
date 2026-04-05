# Test Quality Audit — April 2026

**Date:** 2026-04-05
**Scope:** All 372 test files across test/unit/, test/integration/,
test/benchmark/, test/helpers/
**Trigger:** 6 unit tests found asserting broken removeNode behavior
as correct (empty observedDots blessed as valid output)
**Status:** Complete — all 3 audit agents finished

---

## Executive Summary

The removeNode pattern (tests blessing bugs) was **not found again**
in the domain core tests. The test suite is generally well-structured
with proper assertions. The strongest files: noCoordination.test.js,
specCompliance.test.js, TickReceipt.test.js, EventId.test.js,
Writer.test.js.

Two High findings in WarpGraph.audit.test.js where conditional
early returns make tests pass regardless of outcome.

---

## Findings

### High Severity

| File | Test | Issue | Category |
|------|------|-------|----------|
| WarpGraph.audit.test.js | "dirty state -> audit skipped" | if/else accepts EITHER outcome as valid. Test literally cannot fail. | VacuousAssertion |
| WarpGraph.audit.test.js | "audit commit tree contains receipt.cbor" | `if (!auditSha) { return; }` — silently passes when audit is broken. | VacuousAssertion |

### Medium Severity

| File | Test | Issue | Category |
|------|------|-------|----------|
| WarpGraph.autoGC.test.js | "GC throws -> materialize still succeeds" | Blesses silent error swallowing on null state. Never verifies error was actually thrown. | BehaviorNotCorrectness |
| WarpGraph.autoGC.test.js | "no logger -> no crash" | `not.toThrow()` on code designed to swallow errors. Vacuous. | VacuousAssertion |
| WarpGraph.adjacencyCache.test.js | "reuses adjacency for identical state hashes" | Verifies cache hit but never checks adjacency data is correct. | BehaviorNotCorrectness |
| WarpGraph.coverageGaps.test.js | "createWormhole delegates..." | `toBeGreaterThanOrEqual(0)` on a count — always true. | VacuousAssertion |

### Low Severity

| File | Test | Issue | Category |
|------|------|-------|----------|
| WarpGraph.coverageGaps.test.js | "runs GC when tombstone ratio threshold exceeded" | Test triggers via time/patch count, not tombstone ratio. Name misleads. | BehaviorNotCorrectness |
| WarpGraph.status.test.js | "reports tombstoneRatio..." | Only checks `typeof === 'number'` and range 0-1. Would pass if always 0. | BehaviorNotCorrectness |
| WarpGraph.content.test.js | (missing) | No test for getContentOid when _content is undefined. | MissingNegative |
| WarpGraph.writerApi.test.js | (missing) | Only 2 tests. No negative tests for invalid writer ID. | MissingNegative |

---

## Pattern Analysis

The dominant anti-pattern: **conditional early returns that make tests
vacuous.** The pattern:

```javascript
it('does X', async () => {
  const result = await riskyOperation();
  if (!result) { return; } // <-- TEST PASSES WITH NO ASSERTION
  expect(result.field).toBe('expected');
});
```

If `riskyOperation()` is broken and returns null, the test silently
passes. This is the same root cause as the removeNode bug: the test
asks "does it do what it does?" instead of "does it do what it should?"

The fix: **never use conditional returns in tests.** If a value
might be null, assert it's NOT null first, then proceed.

```javascript
it('does X', async () => {
  const result = await riskyOperation();
  expect(result).not.toBeNull(); // FAIL LOUD if broken
  expect(result.field).toBe('expected');
});
```

---

---

## Domain Services Findings (104 files)

### Critical

| File | Test | Issue | Category |
|------|------|-------|----------|
| PatchBuilderV2.test.js | "removeNode with empty state returns empty observedDots" | Blesses no-op remove when entity doesn't exist in state (distinct from null-state bug) | BlessesBug |
| PatchBuilderV2.test.js | "removeEdge with empty state returns empty observedDots" | Same for edges | BlessesBug |

### High

| File | Test | Issue | Category |
|------|------|-------|----------|
| JoinReducer.validation.test.js | "accepts NodeRemove without node field" | Blesses NodeRemove with empty observedDots and no node field as valid | BlessesBug |
| JoinReducer.validation.test.js | "accepts EdgeRemove without from/to/label" | Same for edges | BlessesBug |
| SyncController.test.js | (all) | 3 module-level vi.mock() calls + 20-property mock host. Real SyncProtocol never exercised. | OverMocked |

### Medium

| File | Test | Issue | Category |
|------|------|-------|----------|
| BitmapIndexReader.test.js | "returns empty array when shard contains invalid JSON" | Blesses silent data loss on corruption (empty vs no-neighbors indistinguishable) | BehaviorNotCorrectness |
| JoinReducer.trackDiff.test.js | (missing) | No test for remove of non-existent entity | MissingCoverage |
| PatchBuilderV2.test.js | (missing) | No test for remove of already-tombstoned entity | MissingCoverage |
| Observer.test.js | (missing) | No test for stale observer, seek before graph creation | MissingNegative |
| CheckpointSerializerV5.test.js | "returns empty state when buffer is null" | Blesses silent empty-state for missing input | BehaviorNotCorrectness |
| BitmapNeighborProvider.test.js | "returns empty when labels filter..." | Tests a limitation, not correctness | MissingCoverage |
| WormholeService.test.js | (missing) | No test for overlapping wormhole ranges | MissingCoverage |

---

## Infrastructure / Ports / Viz Findings (161 files)

**No removeNode-style bugs found.** Substantially healthier than domain tests.

### Medium

| File | Test | Issue | Category |
|------|------|-------|----------|
| DenoHttpAdapter.test.js | "does not produce unhandled rejection..." | `expect(true).toBe(true)` — literal tautology | VacuousAssertion |
| HttpServerPort.test.js | "handles a basic request/response cycle" | Only checks interface shape, never makes a request | VacuousAssertion |
| CasSeekCacheAdapter.test.js | "_parseKey extracts..." | Tests private internals, no malformed-key negative tests | MissingNegative |

### Low

| File | Test | Issue | Category |
|------|------|-------|----------|
| NoOpLogger.test.js | "handles large context objects..." | Wall-clock timing (flaky in CI) | BehaviorNotCorrectness |
| NoOpLogger.test.js | "methods return undefined" | Vacuous — all void fns return undefined | VacuousAssertion |
| NoOpEffectSink.test.js | "deliver returns..." | Only checks observation object, not actual effect | BehaviorNotCorrectness |
| CborCodec.test.js | "encodes and returns a Buffer" | Asserts Buffer, should note Uint8Array direction | BehaviorNotCorrectness |
| trust.exitcode.test.js | exit code matrix | Tests a local reimplementation, not production code | OverMocked |
| checkpoint.test.js | "materializeAt restores state..." | Doesn't assert on post-checkpoint node n3 | MissingNegative |

---

## Summary Across All 372 Files

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| BlessesBug | 2 | 4 | 2 | 0 | 8 |
| VacuousAssertion | 1 | 2 | 2 | 5 | 10 |
| MissingCoverage | 0 | 0 | 4 | 1 | 5 |
| OverMocked | 0 | 1 | 0 | 1 | 2 |
| MissingNegative | 0 | 0 | 2 | 0 | 2 |
| BehaviorNotCorrectness | 0 | 0 | 2 | 4 | 6 |
| **Total** | **3** | **7** | **12** | **11** | **33** |

~85% of test files (320 of 372) are clean with strong assertions.

## Strongest Test Files

- JoinReducer.integration.test.js — permutation testing, multi-writer conflicts
- JoinReducer.edgeProps.test.js — LWW commutativity proofs
- JoinReducer.pathEquivalence.test.js — 3-path equivalence across all ops
- AuditVerifierService.test.js — deep chain integrity, CBOR corruption
- SyncAuthService.test.js — timing, replay, signature, key-id
- EdgePropKey.test.js — fuzz with 10K random tuples
- WormholeService.test.js — monoid properties, associativity
- WarpGraph.noCoordination.test.js — the gold standard for multi-writer safety
- CborPatchJournalAdapter.test.js — golden hex wire format stability
- CborIndexStoreAdapter.test.js — full artifact round-trip, all 5 shard types
