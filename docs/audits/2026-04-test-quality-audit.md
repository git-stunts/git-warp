# Test Quality Audit — April 2026 (Partial: Domain Core)

**Date:** 2026-04-05
**Scope:** test/unit/domain/*.test.js, test/unit/domain/warp/,
test/unit/domain/types/, test/unit/domain/utils/, test/unit/domain/trust/
**Trigger:** 6 unit tests found asserting broken removeNode behavior
as correct (empty observedDots blessed as valid output)
**Status:** Partial — domain services and infra/ports agents still running

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

## Appendix: Files Reviewed (Clean)

The following files were reviewed and found to have no issues:
WarpGraph.noCoordination.test.js, WarpGraph.specCompliance.test.js,
WarpGraph.test.js, WarpGraph.seek.test.js, WarpGraph.seekDiff.test.js,
WarpGraph.fork.test.js, WarpGraph.timing.test.js,
WarpGraph.patchCount.test.js, WarpGraph.patchesFor.test.js,
WarpGraph.frontierChanged.test.js, WarpGraph.invalidation.test.js,
WarpGraph.lazyMaterialize.test.js, WarpGraph.autoCheckpoint.test.js,
WarpGraph.subscribe.test.js, WarpGraph.watch.test.js,
WarpGraph.forkCryptoCodec.test.js, WarpGraph.materializeSlice.test.js,
all trust/ tests, all types/ tests, all utils/ tests, all warp/ tests.
