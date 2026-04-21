---
title: "Unify seek cache and checkpoints"
cycle: "0034-unify-seek-cache-and-checkpoints"
design_doc: "docs/design/0034-unify-seek-cache-and-checkpoints.md"
outcome: hill-met
drift_check: yes
---

# Cycle 0034 Retro — Unify Seek Cache and Checkpoints

**Status:** HILL MET

## Hill

Unify the live seek-cache and checkpoint control plane into one
snapshot system:

- one live resolver path for materialization
- checkpoint = pinned snapshot
- stable checkpoint discoverability preserved
- no legacy snapshot import logic living in `src/`

## What ground was taken

### One live snapshot contract landed

The repo now has an explicit live snapshot contract in
[WarpStateCachePort.ts](/Users/james/git/git-stunts/git-warp/src/ports/WarpStateCachePort.ts).

That contract now owns:

- exact coordinate lookup
- best compatible predecessor lookup
- snapshot storage
- snapshot pinning
- checkpoint-head publication
- checkpoint-head resolution

This is the real noun seam for the unification cut.

### Materialization now has one live resolver path

[MaterializeController.ts](/Users/james/git/git-stunts/git-warp/src/domain/services/controllers/MaterializeController.ts)
no longer keeps the old seek-cache fast path alive beside the new
resolver.

What remains live is:

- unified exact snapshot lookup
- unified predecessor lookup
- replay from the chosen starting point

What no longer remains live is:

- legacy `buildSeekCacheKey(...)`-driven runtime restoration
- the separate `getSeekCache()` fast path inside materialization

That matters because the repo is no longer running two different
snapshot systems in parallel for ceiling vs coordinate materialization.

### Checkpoint creation now means pin + publish

[CheckpointController.ts](/Users/james/git/git-stunts/git-warp/src/domain/services/controllers/CheckpointController.ts)
now does the honest thing on the unified path:

- exact snapshot hit -> pin if needed -> publish checkpoint head
- exact miss -> materialize once -> store snapshot -> pin -> publish
  checkpoint head

And `_loadLatestCheckpoint()` now resolves that published checkpoint
head before falling back to the legacy Git checkpoint ref path.

That means the snapshot-backed path no longer violates the public
checkpoint contract.

### Legacy migration logic was kept out of runtime

This cycle briefly explored a runtime-side legacy snapshot importer.
That approach was rejected and removed in the same cycle.

The final repo truth is:

- legacy snapshot migration does **not** live in `src/`
- legacy seek-cache import remains an offline migration concern
- live runtime code only speaks the current unified snapshot contract

That was the right call.

### Touched residue got cleaned up too

While closing the drift, `WarpRuntime` stopped using an inline fake
logger object with `as unknown as LoggerPort` for the materialization
path. It now uses
[nullLogger.ts](/Users/james/git/git-stunts/git-warp/src/domain/utils/nullLogger.ts).

That cleanup was not the hill, but it was worth landing while the path
was already open.

## Verification

Passed:

- `npm run typecheck`
- `npm exec vitest run test/unit/ports/WarpStateCachePort.test.ts test/unit/domain/services/controllers/MaterializeController.snapshotCache.test.ts test/unit/domain/services/controllers/CheckpointController.snapshotCache.test.ts test/integration/api/checkpoint.snapshotCache.test.ts test/unit/domain/seekCache.test.ts`

Key witness commits:

- `1c2bb1c2` — `feat(snapshot): green unified cache path`
- `45b3d3d6` — `fix(snapshot): resolve unified cache drift`
- `dbaad220` — `refactor(runtime): use null logger in materialize path`

## Playback

### Agent

1. *Does materialization now use one live snapshot resolver path?*
   Yes.
2. *Does checkpoint creation now mean pin/publish rather than second
   artifact invention?*
   Yes.
3. *Is stable checkpoint discoverability preserved on the unified path?*
   Yes.
4. *Does legacy snapshot import remain outside live runtime code?*
   Yes.

### Human

The system is in a saner place now:

- cached state and checkpoint state are one family of thing
- the difference is retention/publication policy, not ontology
- the runtime no longer cheats by keeping the old seek-cache path alive
  under the floorboards

## Drift

Playback originally exposed two serious drifts:

- the old seek-cache runtime path was still alive
- the snapshot-backed checkpoint path was not publishing the stable
  checkpoint handle

Both were fixed in the same cycle.

The only meaningful remaining drift is intentional and bounded:

- the snapshot descriptor is still thinner than the fully elaborated
  design shape
- it does not yet carry fields like `appliedVV`, `storageKind`, or
  `lastAccessedAt`

That remaining drift is acceptable for now because it does not re-split
the control plane.

## Cycle-end upkeep

Backlog and release planning were updated to reflect the landed work:

- [PROTO_materialize-integration.md](/Users/james/git/git-stunts/git-warp/docs/method/backlog/v17.0.0/PROTO_materialize-integration.md)
  no longer lists `DESIGN_0034_unify-seek-cache-and-checkpoints` as a blocker
- [WORKLOADS.md](/Users/james/git/git-stunts/git-warp/docs/method/backlog/WORKLOADS.md)
  now removes `0034` from `WL-38` and reduces the count accordingly
- [docs/releases/v17.0.0/README.md](/Users/james/git/git-stunts/git-warp/docs/releases/v17.0.0/README.md)
  now marks `DESIGN_0034_unify-seek-cache-and-checkpoints` done

Two transient bad-code notes discovered during playback/drift were also
removed in-cycle because the underlying drift was fixed before close.

## What remains

This cycle did **not** finish the whole materialization program.
What remains is downstream work that now stands on a cleaner base:

1. `PROTO_materialize-integration`
2. `PROTO_state-session-async`
3. `PROTO_joinreducer-state-session`
4. `PROTO_gc-state-session`

And outside runtime:

5. offline migration/import tooling for old snapshot/checkpoint
   artifacts under `scripts/v17.0.0/migrate/`
