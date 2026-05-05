# 0127 Runtime Error Reading-Basis Guidance

- Status: `hill met`
- Date: 2026-05-04
- Release lane: `v17.0.0`
- Source task: `SPEC_runtime-error-reading-basis-guidance`
- DAG source: [0124-v17-release-blocker-dag.md](0124-v17-release-blocker-dag.md)

## Hill

Runtime read/provenance errors no longer tell v17 users to "Call
materialize". They explain that no live reading basis, stale reading
basis, or provenance reading index is available, and they point to
[Readings And Optics](../READINGS_AND_OPTICS.md).

## User Stories

- As an app developer, when a read path lacks a basis, I get a recovery
  hint that names worldline/query/readings instead of a removed public
  materialization frontdoor.
- As a provenance user, if a provenance index is unavailable, I am
  pointed toward a provenance reading/diagnostic path rather than
  whole-graph folding.
- As a maintainer, I can run behavioral tests that exercise the errors
  through runtime/controller APIs rather than checking source text.

## Requirements

- Replace shared `E_NO_STATE` and `E_STALE_STATE` messages with
  readings/optics guidance.
- Replace `RuntimeHost._materializedGraphFromCachedState()` no-state
  guidance with the shared no-state message.
- Replace provenance index/degraded guidance in `ProvenanceController`.
- Update stale tests that expected materialization guidance.
- Keep this cycle limited to diagnostics and release bookkeeping.
- Do not change materialization behavior, query semantics, or controller
  host contracts.

## Acceptance Criteria

- RED behavioral tests fail on current materialization guidance.
- GREEN production messages contain `docs/READINGS_AND_OPTICS.md`.
- Runtime/provenance messages do not contain `Call materialize`.
- `CHANGELOG.md` records the diagnostic fix.
- The DAG status marks `SPEC_runtime-error-reading-basis-guidance`
  complete and regenerates the SVG.

## Test Plan

### RED

Add behavioral tests that:

- call a runtime query with `autoMaterialize: false` and no cached state;
- mark a cached runtime state stale and call a runtime query;
- call `ProvenanceController.patchesFor()` with no provenance index;
- call `ProvenanceController.patchesFor()` while provenance is degraded.

Each error should demand readings/optics guidance and reject the stale
"Call materialize" recovery text.

### Goldens

- No-state query error mentions "No live reading basis".
- Stale-state query error mentions "live reading basis is stale".
- Provenance missing-index error mentions "No provenance reading index".
- Degraded provenance error mentions "Provenance reading is unavailable".
- All four messages point to `docs/READINGS_AND_OPTICS.md`.

### Known Fails Outside This Cycle

- `npm run test:local` remains red on non-diagnostic release blockers.
- Controller read-basis seams may still call `_materializeGraph()` until
  their dedicated DAG nodes run.

### Stress / Jitter

This is a diagnostic contract. Runtime stress does not apply. Jitter risk
is message drift, covered by behavioral error tests that execute the
throwing paths.

## Playback Questions

1. Do runtime query errors point to readings/worldlines instead of
   materialization?
2. Do provenance errors point to provenance readings and diagnostics?
3. Did the cycle avoid changing runtime behavior?
4. Did the DAG open front move forward after completion?

## Non-Goals

- Do not remove `_materializeGraph()`.
- Do not alter auto-materialization behavior.
- Do not fix checkpoint schema drift.
- Do not rewrite materialize-spy test clusters.

## RED Evidence

Command:

```sh
npx vitest run test/unit/domain/runtimeReadingBasisErrors.test.ts
```

Initial result: failed as expected, 4 tests failed.

- No-state query errors still said `Call materialize()`.
- Stale-state query errors still said `Call materialize()`.
- Missing provenance index errors still said `Call materialize()`.
- Degraded provenance errors still suggested direct materialization.

## GREEN Implementation

- Updated shared query state diagnostics in `QueryStateMessages.ts`.
- Reused the shared no-state diagnostic in
  `RuntimeHost._materializedGraphFromCachedState()`.
- Updated `ProvenanceController` missing-index and degraded-cache
  diagnostics to point at provenance readings/diagnostics.
- Updated stale error-code, provenance, and slice tests to expect the new
  reading-basis guidance.
- Replaced a stale materialize-spy expectation in the error-code tests
  with behavior: the read succeeds, the cache exists, and dirty state is
  cleared.

## Validation

- `npx vitest run test/unit/domain/runtimeReadingBasisErrors.test.ts`:
  RED failed 4 tests before production changes, then passed.
- `npx vitest run test/unit/domain/runtimeReadingBasisErrors.test.ts test/unit/domain/WarpGraph.errorCodes.test.ts test/unit/domain/WarpGraph.patchesFor.test.ts test/unit/domain/WarpGraph.materializeSlice.test.ts`:
  pass, 4 files / 57 tests.
- `npm run typecheck`: pass.
- `npm run typecheck:consumer`: pass.
- `npm run lint`: pass.
- `npm run lint:md`: pass.
- `npm run lint:md:code`: pass, 942 Markdown files checked.
- `git diff --check`: pass.
- Focused stale-guidance search for old materialization recovery strings
  in source, touched tests, API Reference, and Readings And Optics:
  no matches.

`npm run test:local` was not rerun for this diagnostic slice because the
branch still has known non-diagnostic release blockers tracked in the DAG.

## Playback

- Runtime query errors now point to readings/worldlines instead of
  materialization.
- Provenance errors now point to provenance readings and diagnostics.
- Runtime behavior was not changed.
- The DAG status now removes this task from incomplete blockers.

## Drift Check

The new REDs are behavioral. They execute runtime/controller error paths
and assert user-facing guidance. They do not inspect production source
text.

## Retro

See [0127-runtime-error-reading-basis-guidance.md](../method/retros/0127-runtime-error-reading-basis-guidance.md).
