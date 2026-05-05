# 0128 Checkpoint Schema Contract Drift

- Status: `complete`
- Date: 2026-05-04
- Release lane: `v17.0.0`
- Source task: `BND_checkpoint-schema-contract-drift`
- DAG source: [0124-v17-release-blocker-dag.md](0124-v17-release-blocker-dag.md)

## Hill

The shipped v17 checkpoint boundary has one truth: schema `5` is the
current runtime checkpoint schema, and legacy schemas `2`, `3`, and `4`
are rejected with migration guidance. Checkpoint creation publishes a
schema-5 envelope tree, and checkpoint loading accepts that envelope
without falling back to legacy `state.cbor`.

## User Stories

- As a release reviewer, I can read one exported schema matrix and know
  exactly which checkpoint schemas v17 supports.
- As an operator, if a legacy checkpoint is encountered, the error names
  the schema and says migration is required.
- As a maintainer, checkpoint tests no longer argue about schema 2/3/4
  versus schema 5.

## Requirements

- Export a single checkpoint schema matrix from `checkpointHelpers.ts`.
- Make checkpoint creation emit schema `5`.
- Make checkpoint loading accept schema `5`.
- Make checkpoint loading reject legacy schemas `2`, `3`, and `4`.
- Preserve current runtime readback by reconstructing in-memory
  `WarpState` from the schema-5 envelope.
- Keep this cycle scoped to checkpoint schema/load/create behavior.

## Acceptance Criteria

- RED checkpoint schema tests go green.
- Current schema-5 checkpoint creation writes an envelope with `state/`
  entries and no `state.cbor`.
- Current schema-5 checkpoint loading succeeds.
- Legacy schema 2/3/4 checkpoint loading rejects with
  `E_CHECKPOINT_UNSUPPORTED_SCHEMA` and migration guidance.
- `CHANGELOG.md` records the schema contract fix.
- The DAG status marks `BND_checkpoint-schema-contract-drift` complete
  and regenerates the SVG.

## Test Plan

### RED

- Existing RED:
  `npx vitest run test/unit/domain/services/CheckpointService.test.ts test/unit/domain/services/CheckpointService.edgeCases.test.ts`
  currently fails 9 tests:
  - schema 2/3/4 legacy checkpoints resolve instead of rejecting;
  - schema 5 load rejects as unsupported;
  - schema 5 creation still writes the legacy tree shape.
- Add a narrow schema-matrix contract test for current, supported, and
  rejected legacy schema constants.

### Goldens

- `CURRENT_CHECKPOINT_SCHEMA === 5`.
- `SUPPORTED_CHECKPOINT_SCHEMAS === [5]`.
- `REJECTED_LEGACY_CHECKPOINT_SCHEMAS === [2, 3, 4]`.
- `isV5CheckpointSchema(5) === true`.
- `isV5CheckpointSchema(2 | 3 | 4) === false`.
- `loadCheckpoint()` rejects schemas 2/3/4/99 and loads schema 5.

### Known Fails Outside This Cycle

- Controller reading-basis cleanup remains separate.
- `npm run test:local` remains red with `42` failures across stale
  materialize-spy clusters, controller reading-basis seams, observer
  coordinate pinning, uniform git-cas upgrade text, and stale legacy
  checkpoint fixtures. Those map to the remaining DAG nodes.
- `npx vitest run test/unit/domain/services/controllers/CheckpointController.test.ts test/unit/domain/services/controllers/ForkController.test.ts`
  now passes the fork controller schema guard but still has
  `CheckpointController` failures around `_materializeGraph()` and stale
  materialize-wording assertions. Those belong to
  `PORT_checkpoint-controller-reading-basis`.
- `npx vitest run test/integration/api/checkpoint.test.ts` still fails
  `materializeAt restores state from checkpoint` on the session-backed
  runtime line. That is not a schema matrix failure.

### Stress / Jitter

Checkpoint create/load roundtrip tests cover non-empty state, empty
state, provenance index, index subtree, and missing envelope entries. No
separate stress harness is needed in this slice.

## Playback Questions

1. Is there exactly one exported schema truth?
2. Does creation emit schema 5 in both normal and index-tree cases?
3. Does loading reject legacy schemas with migration guidance?
4. Does schema-5 load reconstruct enough runtime state for current
   materialize/checkpoint behavior?
5. Did the DAG unlock checkpoint-controller reading-basis work?

## Non-Goals

- Do not implement the full post-v17 live-tail bounded query substrate.
- Do not remove checkpoint controller materialization seams.
- Do not redesign sync security.

## GREEN

- `checkpointHelpers.ts` now exports a single runtime schema matrix:
  `CURRENT_CHECKPOINT_SCHEMA = 5`,
  `SUPPORTED_CHECKPOINT_SCHEMAS = [5]`, and
  `REJECTED_LEGACY_CHECKPOINT_SCHEMAS = [2, 3, 4]`.
- `checkpointCreate.ts` now writes schema-5 checkpoints as an envelope
  tree with a `state/` subtree rather than a legacy `state.cbor` blob.
- `checkpointLoad.ts` now loads schema-5 envelope trees and rejects
  legacy checkpoint schemas before reading legacy artifacts.
- `CheckpointService` unit and edge-case tests now cover schema-5
  create/load, legacy rejection, missing envelope entries, provenance
  index, index subtree, empty state, and incremental materialization.
- `ForkController` now treats only the current v17 checkpoint schema as
  eligible for checkpoint-frontier backfill validation.
- The checkpoint-tail optic conformance fixture no longer depends on
  schema `4` as an index-tree marker; schema `5` is the schema, and the
  index tree is a layout artifact.

## Validation

Passed:

```sh
npx vitest run test/unit/domain/services/checkpointSchemaContract.test.ts test/unit/domain/services/CheckpointService.test.ts test/unit/domain/services/CheckpointService.edgeCases.test.ts
npx vitest run test/unit/domain/services/checkpointSchemaContract.test.ts test/unit/domain/services/CheckpointService.test.ts test/unit/domain/services/CheckpointService.edgeCases.test.ts test/unit/domain/services/controllers/ForkController.test.ts
npx vitest run test/conformance/v17CheckpointTailOpticReadBasis.test.ts
npm run typecheck
npm run typecheck:consumer
npm run lint
npm run lint:md
npm run lint:md:code
npm audit --omit=dev --audit-level=high
git diff --check
```

Still red and assigned elsewhere:

```sh
npm run test:local
npx vitest run test/unit/domain/services/controllers/CheckpointController.test.ts test/unit/domain/services/controllers/ForkController.test.ts
npx vitest run test/integration/api/checkpoint.test.ts
```

## Playback

1. Exactly one exported schema truth exists for runtime checkpoint
   loading and creation.
2. Creation emits schema `5` in normal and index-tree checkpoint paths.
3. Loading rejects legacy schemas `2`, `3`, and `4` with migration
   guidance and stable error code.
4. Schema-5 loading reconstructs runtime `WarpState` from the envelope.
5. `PORT_checkpoint-controller-reading-basis` is now an open DAG node.
