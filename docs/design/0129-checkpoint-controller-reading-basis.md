# 0129 Checkpoint Controller Reading Basis

- Status: `complete`
- Date: 2026-05-04
- Release lane: `v17.0.0`
- Source task: `PORT_checkpoint-controller-reading-basis`
- DAG source: [0124-v17-release-blocker-dag.md](0124-v17-release-blocker-dag.md)

## Hill

`CheckpointController.createCheckpoint()` checkpoints an explicit
available reading basis. It uses an exact snapshot-cache reading when
present or a clean cached runtime state when present. If neither exists,
it fails closed with the v17 readings guidance. It must not call
`_materializeGraph()` to manufacture a checkpoint state.

## User Stories

- As a release reviewer, I can inspect the checkpoint controller host
  contract and see no dependency on `_materializeGraph()`.
- As an app developer, calling `createCheckpoint()` without an available
  reading basis gives the same v17 readings guidance as other read paths.
- As a maintainer, checkpoint snapshot-cache behavior remains intact
  without smuggling full replay behind checkpoint creation.

## Requirements

- Remove `_materializeGraph()` from `CheckpointController`'s host
  contract.
- Make `createCheckpoint()` use a clean `_cachedState` or an exact
  `_stateCache` snapshot only.
- Make `createCheckpoint()` fail closed with `E_NO_STATE` if the cached
  state is missing or dirty and no exact snapshot exists.
- Preserve snapshot-cache fast path behavior:
  - exact snapshot is pinned and published;
  - clean cached state can be stored, pinned, and published.
- Preserve legacy Git checkpoint creation when a clean cached state is
  available.
- Keep this cycle scoped to `CheckpointController`; do not fix patch,
  subscription, sync, observer, or materialize-spy clusters.

## Acceptance Criteria

- RED checkpoint-controller tests fail before the implementation.
- `CheckpointController` source no longer references `_materializeGraph`.
- `CheckpointController.test.ts` and
  `CheckpointController.snapshotCache.test.ts` pass.
- Existing fork controller schema tests from 0128 still pass.
- `CHANGELOG.md` records the checkpoint-controller seam fix.
- DAG status marks `PORT_checkpoint-controller-reading-basis` complete,
  unlocks its children, and regenerates the SVG.

## Test Plan

### RED

- Add/adjust behavior tests proving:
  - clean cached state creates a checkpoint without calling a
    `_materializeGraph` trap;
  - dirty cached state fails closed with `E_NO_STATE`;
  - missing cached state fails closed with `E_NO_STATE`;
  - snapshot-cache exact misses store/pin only when a clean cached state
    is available.

### Goldens

- `createCheckpoint()` with clean cached state calls
  `createCheckpointCommit()` with that state.
- `createCheckpoint()` with dirty or missing cached state rejects before
  checkpoint artifact creation.
- Snapshot cache exact hits still avoid creating a checkpoint artifact.
- No controller host type mentions `_materializeGraph()`.

### Known Fails Outside This Cycle

- Patch, subscription, sync, and materialize controller tests still own
  their separate `_materializeGraph()` seams.
- `SPEC_materialize-spy-test-clusters` still owns stale internal spy
  expectations after controller seams settle.
- Observer coordinate pinning and uniform git-cas upgrade text remain
  separate open DAG nodes.
- `npm run test:local` remains red with `38` failures after this cycle:
  patch/sync/subscription seams, stale materialize-spy assertions,
  legacy schema fixtures, observer coordinate pinning, uniform git-cas
  upgrade text, and checkpoint-index/materializeAt fallout are assigned
  to remaining DAG nodes.

### Stress / Jitter

Checkpoint creation is not a stress path in this slice. The useful
jitter check is state-basis selection: snapshot exact hit, clean cached
state, dirty cached state, and null cached state.

## Playback Questions

1. Does `CheckpointController` have any `_materializeGraph` dependency?
2. Does checkpoint creation fail closed rather than full-replay when no
   reading basis exists?
3. Does a clean cached state still create a Git checkpoint artifact?
4. Does snapshot-cache publish/pin behavior still work?
5. Did the DAG unlock downstream materialize-spy cleanup without
   touching unrelated controller seams?

## Non-Goals

- Do not remove `_materializeGraph()` from `PatchController`,
  `SubscriptionController`, `SyncController`, or `RuntimeHost`.
- Do not change checkpoint schema behavior from cycle 0128.
- Do not rewrite GC ownership or migration validation.

## RED

The initial checkpoint-controller witness failed before the production
change:

```sh
npx vitest run test/unit/domain/services/controllers/CheckpointController.test.ts test/unit/domain/services/controllers/CheckpointController.snapshotCache.test.ts
```

Observed failures:

- Dirty cached state fell through to a missing `_materializeGraph()`
  function instead of failing with `E_NO_STATE`.
- Missing cached state fell through to a missing `_materializeGraph()`
  function instead of failing with `E_NO_STATE`.
- Snapshot-cache exact miss called a `_materializeGraph()` trap instead
  of requiring a clean cached reading basis.

The broader unit gate then exposed six stale `WarpGraph.test.ts`
checkpoint callers that stubbed `_materializeGraph()` as the checkpoint
state source. Those were same-slice stale witnesses and were updated to
install a clean checkpoint reading basis.

## GREEN

- `CheckpointController` no longer includes `_materializeGraph()` in its
  host contract.
- `createCheckpoint()` now uses an exact snapshot-cache record first, or
  a clean `_cachedState` reading basis when no exact snapshot exists.
- Dirty or missing cached state now fails closed with `QueryError`
  `E_NO_STATE` and the v17 readings guidance.
- Snapshot-cache exact hits still publish/pin the existing snapshot, and
  exact misses store a new snapshot only when a clean cached state
  exists.
- Unit checkpoint tests now use behavior witnesses:
  - clean cached state creates a checkpoint without materializing;
  - dirty state rejects before checkpoint artifact creation;
  - missing state rejects before checkpoint artifact creation;
  - snapshot-cache exact miss requires a clean cached reading basis.
- Public `WarpGraph.test.ts` checkpoint creation tests no longer stub
  `_materializeGraph()` as the source of checkpoint truth.

## Validation

Passed:

```sh
npx vitest run test/unit/domain/services/controllers/CheckpointController.test.ts test/unit/domain/services/controllers/CheckpointController.snapshotCache.test.ts
npx vitest run test/unit/domain/services/controllers/CheckpointController.test.ts test/unit/domain/services/controllers/CheckpointController.snapshotCache.test.ts test/unit/domain/warp/checkpoint.gc-isolation.test.ts test/integration/api/checkpoint.snapshotCache.test.ts
npx vitest run test/unit/domain/WarpGraph.test.ts -t "createCheckpoint"
npm run typecheck
npm run typecheck:consumer
npm run lint
npm run lint:sludge
npm run lint:md
npm run lint:md:code
npm audit --omit=dev --audit-level=high
git diff --check
```

Still red and assigned elsewhere:

```sh
npm run test:local
```

Latest `test:local` shape after this cycle:

```text
Test Files  17 failed | 419 passed (436)
Tests       38 failed | 6746 passed (6784)
```

## Playback

1. `CheckpointController` has no host-contract dependency on
   `_materializeGraph()`.
2. Checkpoint creation now fails closed with v17 readings guidance when
   no exact snapshot or clean cached state exists.
3. A clean cached state still creates a Git checkpoint artifact and
   updates the checkpoint ref.
4. Snapshot-cache publish/pin behavior still works for exact hits and
   clean-state misses.
5. The DAG now marks `PORT_checkpoint-controller-reading-basis` complete
   and removes it from downstream incomplete blocker sets.
