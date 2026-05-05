# 0130 Patch Controller Reading Basis

- Status: `Final`
- Date: 2026-05-04
- Release lane: `v17.0.0`
- Source task: `PORT_patch-controller-reading-basis`
- DAG source: [0124-v17-release-blocker-dag.md](0124-v17-release-blocker-dag.md)

## Hill

`PatchController` no longer calls `_materializeGraph()` to manufacture
state for patch creation or freshness checks. It allows additive patch
creation without a cached reading basis, and it requires an explicit
clean cached state for operations that need current state knowledge.

## User Stories

- As a release reviewer, I can inspect `PatchController.PatchHost` and
  see no dependency on `_materializeGraph()`.
- As an app developer, additive patch creation still works without
  forcing a full read.
- As a maintainer, state-dependent patch/read helpers fail with v17
  reading-basis errors instead of triggering hidden replay.
- As a subscription maintainer, patch freshness no longer hides a
  materialization seam that subscription cleanup has to inherit.

## Requirements

- Remove `_materializeGraph()` from `PatchHost`.
- Remove create-time auto-materialization from `createPatch()`.
- Preserve first-patch and additive-patch builder creation.
- Make `_ensureFreshState()` require an existing clean cached state.
- Preserve `E_NO_STATE` for missing cached state and `E_STALE_STATE` for
  dirty cached state.
- Keep this cycle scoped to `PatchController` and its direct witnesses;
  do not fix subscription/watch, sync, observer, or stale global
  materialize-spy clusters.

## Acceptance Criteria

- RED patch-controller tests fail before the implementation.
- `PatchController.ts` no longer references `_materializeGraph`.
- `PatchController.test.ts` passes.
- Existing checkpoint-controller focused witnesses from cycle 0129 still
  pass.
- `CHANGELOG.md` records the patch-controller seam fix.
- DAG status marks `PORT_patch-controller-reading-basis` complete,
  unlocks `PORT_subscription-controller-reading-basis`, and regenerates
  the SVG.

## Test Plan

### RED

- Adjust `createPatch()` tests so an existing parent plus missing cached
  state does not call a `_materializeGraph` trap.
- Adjust `_ensureFreshState()` tests so missing or dirty cached state
  rejects with `QueryError` even when `_autoMaterialize` is true.
- Assert additive patch builder creation still happens when the cached
  state is missing.

### Goldens

- `createPatch()` with an existing parent and no cached state constructs
  a `PatchBuilder` with `getCurrentState()` returning `null`.
- `createPatch()` never calls a `_materializeGraph` trap.
- `_ensureFreshState()` missing state rejects with `E_NO_STATE`.
- `_ensureFreshState()` dirty state rejects with `E_STALE_STATE`.
- Clean cached state remains accepted.

### Known Fails Outside This Cycle

- Subscription/watch materialize-spy expectations still belong to
  `PORT_subscription-controller-reading-basis`.
- Sync materialization and security hardening remain separate nodes.
- Global `WarpGraph.lazyMaterialize` and adjacency-cache spy clusters
  remain under `SPEC_materialize-spy-test-clusters` after controller
  seams settle.
- `npm run test:local` remains red until the remaining DAG nodes close.

### Stress / Jitter

Patch creation itself is not a stress path in this slice. The useful
jitter matrix is state-basis selection:

- existing parent + missing cached state;
- existing parent + clean cached state;
- existing parent + dirty cached state;
- first patch + missing cached state;
- explicit auto-materialize enabled and disabled.

## Playback Questions

1. Does `PatchController` have any `_materializeGraph` dependency?
2. Can additive patch creation still proceed without a cached reading
   basis?
3. Do state-dependent freshness checks fail closed with reading-basis
   errors?
4. Does this unlock subscription-controller cleanup in the DAG?
5. Did the cycle avoid touching sync, observer, and global spy clusters?

## Playback Answers

1. Yes. `PatchHost` and `PatchController.ts` no longer reference
   `_materializeGraph()`.
2. Yes. `createPatch()` now builds additive patches with
   `getCurrentState()` returning `null` when no cached state exists.
3. Yes. `_ensureFreshState()` rejects missing state with `E_NO_STATE`
   and dirty state with `E_STALE_STATE`.
4. Yes. The DAG now marks `PORT_patch-controller-reading-basis`
   complete and opens `PORT_subscription-controller-reading-basis`.
5. Yes. Sync, observer, and the global stale materialize-spy clusters
   remain separate release blockers.

## Validation

- `npx vitest run test/unit/domain/services/controllers/PatchController.test.ts`
  passed: `66` tests.
- `npm run lint` passed after making `_ensureFreshState()` return an
  explicit promise instead of remaining an `async` method with no
  awaited work.
- `npm run typecheck` passed.
- `npm run typecheck:consumer` passed.
- `npm run test:local` remains red outside this cycle: `71` failures
  across `19` files, concentrated in subscription, sync, observer,
  retired-schema, and stale materialize-spy release blockers.

## Non-Goals

- Do not change `PatchBuilder` delete semantics.
- Do not rewrite RuntimeHost or materialization internals.
- Do not fix subscription/watch polling.
- Do not fix sync response application.
