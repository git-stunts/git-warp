# 0136 Checkpoint Materialize Test Drift

- Status: `Final`
- Date: 2026-05-05
- Release lane: `v17.0.0`
- Source task: `SPEC_checkpoint-materialize-test-drift`
- DAG source: [0124-v17-release-blocker-dag.md](0124-v17-release-blocker-dag.md)

## Hill

The remaining checkpoint/materialize failures stop asserting retired
checkpoint schemas and old private materialization seams. Tests either
use the current checkpoint schema contract or assert the explicit upgrade
failure for retired checkpoint fixtures.

## User Stories

- As a release reviewer, `test:local` no longer fails because unit tests
  still expect schemas `2` or `4` to load in the shipped runtime.
- As a maintainer, incremental materialization unit tests exercise the
  current checkpoint contract rather than bypassed private RuntimeHost
  methods.
- As an upgrader, retired checkpoint fixtures fail with migration
  guidance instead of pretending to be supported runtime fixtures.

## Requirements

- Keep retired checkpoint readers out of main `src/`.
- Prefer updating stale tests to the current checkpoint contract over
  reintroducing legacy runtime support.
- Preserve positive incremental materialization coverage for current
  checkpoints.
- Preserve explicit retired-schema rejection coverage where a fixture is
  intentionally legacy.
- Do not change production code unless a focused behavioral test proves
  a real current-schema bug.

## Acceptance Criteria

- Focused checkpoint/materialize drift suite goes green.
- Full `npm run test:local` no longer has checkpoint/materialize drift
  failures.
- DAG marks `SPEC_checkpoint-materialize-test-drift` complete.
- Remaining open front is sync security/quarantine/full-release work.

## Test Plan

### RED

```sh
npx vitest run \
  test/unit/domain/services/controllers/MaterializeController.test.ts \
  test/unit/domain/warp/hydrateCheckpointIndex.regression.test.ts \
  test/unit/domain/WarpGraph.patchCount.test.ts \
  test/unit/domain/WarpGraph.autoCheckpoint.test.ts \
  test/unit/domain/WarpGraph.test.ts \
  test/unit/domain/WarpGraph.patchesFor.test.ts
```

Initial result: 6 failed files, 14 failed tests, and 164 passing tests.

### GREEN

```sh
npx vitest run \
  test/unit/domain/services/controllers/MaterializeController.test.ts \
  test/unit/domain/warp/hydrateCheckpointIndex.regression.test.ts \
  test/unit/domain/WarpGraph.patchCount.test.ts \
  test/unit/domain/WarpGraph.autoCheckpoint.test.ts \
  test/unit/domain/WarpGraph.test.ts \
  test/unit/domain/WarpGraph.patchesFor.test.ts
```

Final result: 6 passed files and 178 passed tests.

```sh
npm run test:local
```

Final result: 437 passed files and 6757 passed tests.

### Goldens

- Current-schema checkpoint unit fixtures use schema `5`.
- MaterializeController incremental path loads patches since a current
  checkpoint, reports patch count, max lamport, receipts, and provenance.
- Retired checkpoint fixtures reject with upgrade guidance.
- Backfill validation tests use current checkpoint frontiers when
  asserting same/behind/diverged rejection.

### Known Fails Outside This Cycle

- Sync secret hardening and production sync defaults remain under
  `HEX_sync-*`.
- Quarantine graduation remains near-end work.

### Stress / Jitter

- Current checkpoint with no new patches.
- Current checkpoint with multiple new patches.
- Current checkpoint with receipts enabled.
- Retired checkpoint schema rejection.
- Backfill same, behind, ahead, diverged.

## Playback Questions

1. Did we keep legacy schema loading out of main `src/`?
   Yes. This slice changed tests and release artifacts only; no runtime
   legacy reader was added to `src/`.
2. Do current checkpoint fixtures use the current schema contract?
   Yes. Current checkpoint/materialize fixtures now use schema `5`.
3. Do retired checkpoint fixtures fail with upgrade guidance?
   Yes. Retired checkpoint fixtures now assert
   `E_CHECKPOINT_UNSUPPORTED_SCHEMA`.
4. Does full `test:local` shed the checkpoint/materialize failures?
   Yes. `npm run test:local` passed 437 files and 6757 tests.
5. What remains open in the DAG?
   The open front is `HEX_sync-secret-plain-string`; full release remains
   blocked by sync security hardening and quarantine graduation.

## Implementation Notes

- Replaced stale schema `2` and `4` checkpoint fixtures with schema `5`
  where the test exercises current checkpoint/materialize behavior.
- Converted intentionally retired checkpoint fixtures in
  `WarpGraph.materializeAt()` and provenance checkpoint loading to assert
  `E_CHECKPOINT_UNSUPPORTED_SCHEMA`.
- Updated backfill validation fixtures to use current checkpoint
  frontiers, so same, behind, ahead, and diverged checks actually exercise
  current behavior instead of bypassing on a retired schema.

## Validation

- `npx vitest run test/unit/domain/services/controllers/MaterializeController.test.ts test/unit/domain/warp/hydrateCheckpointIndex.regression.test.ts test/unit/domain/WarpGraph.patchCount.test.ts test/unit/domain/WarpGraph.autoCheckpoint.test.ts test/unit/domain/WarpGraph.test.ts test/unit/domain/WarpGraph.patchesFor.test.ts`
- `npm run test:local`
- `npm run lint`
- `npm run lint:sludge`
- `npm run typecheck`
- `npm run typecheck:consumer`
- `npm run lint:md`
- `npm run lint:md:code`
- `npm audit --omit=dev --audit-level=high`
- `git diff --check`

All commands passed.

## Drift

- `test:local` is no longer a release blocker after this slice.
- The remaining release DAG front is sync security hardening followed by
  quarantine graduation and release preflight.

## Non-Goals

- Do not implement a retired schema runtime loader.
- Do not change migration scripts in this slice.
- Do not address sync auth/rate-limit/500 hardening.
