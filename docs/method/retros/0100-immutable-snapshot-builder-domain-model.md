# 0100 Immutable Snapshot Builder Domain Model Retrospective

- Outcome: `hill met`
- Cycle doc: [docs/design/0100-immutable-snapshot-builder-domain-model.md](../../design/0100-immutable-snapshot-builder-domain-model.md)
- Release lane: `v17.0.0`

## Outcome

0100 succeeded as an immutable snapshot model repair. It removed generic
clone/freeze preservation, rejected unsupported snapshot sources
explicitly, and replaced arbitrary `clone<T>() -> T` behavior with
source-specific snapshot construction for `WarpState` and
`TickReceipt[]`.

The implementation repaired the `ImmutableSnapshot` blocker for
`0096-purge-cast-hacks`:

- generic `createImmutableValue<T>(value: T): T` was removed;
- arbitrary descriptor-copy reconstruction was removed;
- `Object.create` was removed from `ImmutableSnapshot.ts`;
- `as unknown as T` was removed from `ImmutableSnapshot.ts`;
- unsupported sources now fail explicitly;
- receipt arrays now reject non-`TickReceipt` entries;
- `WarpState` snapshots detach from live source mutation;
- read-only collection behavior is preserved for supported snapshots;
- `ImmutableSnapshot.ts` graduated from `0025A-casts.json`.

## What Went Well

The RED test targeted behavior, not just syntax. It caught the runtime
crime: unsupported constructor-guarded class instances were being
descriptor-copied and frozen instead of rejected.

GREEN fixed the actual root lie. The replacement API is source-specific:

- `createImmutableWarpStateSnapshot(state: WarpState): WarpState`
- `createImmutableTickReceiptArraySnapshot(receipts: readonly TickReceipt[]): readonly TickReceipt[]`

That gave the snapshot code a narrow domain meaning instead of a generic
preservation promise.

## What Went Wrong

The original helper had hidden public surface dishonesty. Receipt arrays
were already frozen at runtime, but the type surface still said
`TickReceipt[]`. Repairing the snapshot model required propagating
`readonly TickReceipt[]` through immediate materialization surfaces.

The new `ImmutableSnapshot.ts` also concentrates several read-only
collection wrapper classes in one file. That is acceptable for the slice,
but the file should not become a future helper corridor.

## What Changed From Original Plan

The PULL expected source-specific construction for `WarpState` and
receipt arrays. GREEN followed that plan.

The main beneficial drift was type honesty: `readonly TickReceipt[]`
propagated through public materialization receipt surfaces because that
is what the runtime already returns after freezing.

No generic snapshot protocol was introduced.

## What This Cycle Proved

The cycle proved that immutable read-side snapshots do not require
arbitrary descriptor-copy cloning.

It also proved:

- `WarpState` snapshotting can be built from known runtime structures;
- `VersionVector` can be cloned through its runtime API;
- supported `Map` and `Set` snapshots can reject normal mutation
  attempts;
- receipt arrays can be copied and frozen while preserving real
  `TickReceipt` instances;
- unsupported sources can fail explicitly instead of being copied with
  prototype/descriptor tricks.

## What This Cycle Did Not Prove

0100 did not prove that all 0096 cast blockers are fixed. It repaired
only the `ImmutableSnapshot` blocker.

It also did not prove:

- read-only collection wrapper classes should stay in one file forever;
- cloned `Uint8Array` property values are intrinsically immutable;
- materialized-view storage seam casts are repaired;
- snapshot persistence or default-on policy is repaired;
- a future explicit snapshot protocol is never needed.

Those are separate questions.

## Why 0096 Remains Blocked

`0096-purge-cast-hacks` remains blocked because non-0100 cast families
remain.

Known remaining cast-hit files/families:

- `MaterializedViewHelpers`
- `MaterializedViewService`
- `checkpointLoad`
- `HttpSyncServer`
- `TemporalQuery`
- `VisibleStateScope`
- `WarpStream`

Stale or non-hit manifest entries also remain in `0025A-casts.json`,
including `WarpGraph`, `StrandController`, and `Observer`.

Resuming all of 0096 at once would recreate whac-a-cast. Continue by
pulling the next root-cause blocker.

## Follow-Up Handling

Drift and Playback identified these candidates:

- `IMM_snapshot-readonly-collection-wrapper-split`
- `IMM_readonly-byte-propvalue-snapshot`
- `API_readonly-receipts-release-note`

Created v17 backlog card:

- `API_readonly-receipts-release-note`

Reason: `readonly TickReceipt[]` is a public surface correction and
should be called out in release notes or migration docs.

Folded into future hardening, no separate card yet:

- `IMM_snapshot-readonly-collection-wrapper-split`
- `IMM_readonly-byte-propvalue-snapshot`

Reason: the wrapper density and detached-but-mutable byte-array
limitation are real weak spots, but they are not active blockers for
0100 or immediate 0096 progression.

## Recommendation For Next Cycle

Do not resume the whole `0096-purge-cast-hacks` cycle as one blob.

Recommended next cycle:

- `IDX_property-reader-capability-port`

Reason: it is the existing backlog card for the remaining
materialized-view/property-index storage seam pattern. The next root lie
is the `readBlob`-only object being cast to the larger
`IndexStoragePort` surface in `MaterializedViewHelpers` and
`MaterializedViewService`.
