# Cycle 0010 — 100% Code Coverage

**Status:** DESIGN

**Date:** 2026-04-05

## Sponsors

- **Human:** James Ross
- **Agent:** Claude (Opus)

## Hill

Establish the FULL-COVERAGE invariant and install the CI ratchet.
Write tests for the highest-risk untested code until coverage reaches
100% lines or the cycle reaches a natural break.

## Playback questions

### Agent questions

1. Does `vitest --coverage` report 100% line coverage?
2. Is there a CI-enforceable threshold that prevents regression?
3. Are the untested giants (StrandService, ConflictAnalyzerService,
   controllers) now covered?
4. Do the new tests verify behavior, not implementation?

### Human questions

1. Do the tests catch real bugs?
2. Is the coverage number honest (no `/* v8 ignore */` cheats)?

## Baseline (2026-04-05)

| Metric | Value |
|--------|-------|
| Lines | 85.46% |
| Branches | 75.03% |
| Functions | 88.93% |
| Statements | 85.14% |

### Zero-coverage source files (domain)

| File | LOC | Risk |
|------|-----|------|
| `ConflictAnalyzerService.js` | 2582 | Critical — conflict resolution |
| `StrandService.js` | 2060 | Critical — strand lifecycle |
| `ComparisonController.js` | 1212 | High — graph comparison |
| `MaterializeController.js` | 1010 | High — materialization orchestration |
| `QueryController.js` | 946 | High — query dispatch |
| `SyncController.js` | 684 | High — sync orchestration |
| `PatchController.js` | 526 | High — patch lifecycle |
| `WarpCore.js` | 504 | High — plumbing API |
| `CheckpointController.js` | 431 | Medium — checkpoint orchestration |
| `WarpApp.js` | 319 | Medium — product API |
| `ForkController.js` | 294 | Medium — fork operations |
| `SubscriptionController.js` | 248 | Medium — event subscriptions |
| `ProvenanceController.js` | 243 | Medium — provenance queries |
| `StrandController.js` | 182 | Low — strand delegation |
| **Total** | **12,278** | |

## Strategy

### Phase 1 — Install the ratchet

- Add `@vitest/coverage-v8` as devDependency
- Configure vitest coverage thresholds at current baseline (85%)
- Add coverage check to pre-push hook
- Write the FULL-COVERAGE invariant

### Phase 2 — Test the controllers (smallest first)

Controllers are thin delegation layers. They're the fastest path to
coverage gains. Order by LOC ascending:

1. StrandController (182 LOC)
2. ProvenanceController (243 LOC)
3. SubscriptionController (248 LOC)
4. ForkController (294 LOC)
5. CheckpointController (431 LOC)
6. PatchController (526 LOC)
7. SyncController (684 LOC)
8. QueryController (946 LOC)
9. MaterializeController (1010 LOC)
10. ComparisonController (1212 LOC)

### Phase 3 — Test the strand services

The heaviest files. These need deep understanding of strand and
conflict semantics:

11. StrandService (2060 LOC)
12. ConflictAnalyzerService (2582 LOC)

### Phase 4 — Test WarpApp / WarpCore / WarpRuntime

These are integration-level — they orchestrate controllers. May
already get incidental coverage from controller tests.

13. WarpApp (319 LOC)
14. WarpCore (504 LOC)
15. WarpRuntime (1037 LOC)

## Non-goals

- Branch coverage. Line coverage first. Branch coverage is the
  follow-on ratchet.
- Mutation testing. That's a separate invariant.
- Test the CLI commands (`bin/cli/commands/`). CLI tests are in BATS.
- Test the visualization barrel files (`index.js` re-exports).

## Accessibility / assistive reading posture

Not applicable — test-only cycle.

## Localization / directionality posture

Not applicable.

## Agent inspectability / explainability posture

Tests are the most inspectable artifact an agent can produce. Each
test file documents the behavior contract of the service it covers.

## Hard gates

- Coverage must not decrease from baseline (ratchet)
- noCoordination suite: 7/7
- Existing test suite: all passing
- No `/* v8 ignore */` suppressions
