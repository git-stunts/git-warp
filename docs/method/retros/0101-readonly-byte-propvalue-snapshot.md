# 0101 Readonly Byte PropValue Snapshot Retro

## Outcome

0101 closes as blocked/not-met.

The cycle was a corrective follow-up to 0100. It proved that
byte-valued public immutable snapshots were detached from live source
bytes but still publicly mutable. That is a real semantic hole in the
immutable snapshot guarantee.

## What Went Well

- RED encoded the strict contract: public immutable snapshots must not
  expose mutable byte values.
- The RED preserved source detachment as a separate fact from snapshot
  immutability.
- Detached-only semantics were not accepted by accident.
- The rejected proxy/table-dispatch `Uint8Array` implementation was
  removed from local branch history before push.
- The cycle identified the missing noun family instead of forcing a fake
  local patch.

## What Went Wrong

- The first GREEN attempt tried to preserve `Uint8Array` as the public
  snapshot byte representation.
- That led to proxy-backed method/scalar dispatch, which was rejected as
  dynamic dispatch sludge.
- The cycle exposed that `createImmutableWarpStateSnapshot(...):
  WarpState` is likely too broad if snapshot prop values differ from
  storage prop values.

## What Changed From Original Plan

The original plan expected either a narrow immutable-byte implementation
or an explicit detached-only decision. The cycle instead discovered that
the honest fix requires a distinct snapshot value/state model.

That means 0101 should not implement `ImmutableBytes` directly. The next
step is to design the public snapshot API model first.

## What This Cycle Proved

- `PropValue` can include `Uint8Array`.
- Public `WarpState` snapshots expose `state.prop` values.
- The current byte snapshot is detached from the source.
- The current byte snapshot is still mutable.
- Fake immutable `Uint8Array` facades are the wrong direction.
- Storage `PropValue` and snapshot prop values are different concepts.

## What This Cycle Did Not Prove

- It did not define `ImmutableBytes` or `ReadonlyBytes`.
- It did not define `SnapshotPropValue`.
- It did not decide whether snapshots return `SnapshotWarpState` instead
  of `WarpState`.
- It did not update materialization API return types.
- It did not settle query/property-bag byte semantics.
- It did not repair the standing RED.

## Why 0096 Remains Blocked

0096 remains blocked because 0101 did not produce an accepted production
repair. The remaining issue is not a local cast or mutability patch. It
is a public type-model decision for immutable snapshot values.

## Follow-Up Handling

Created:

- `docs/method/backlog/bad-code/IMM_snapshot-propvalue-api-model.md`

That card owns the next design question:

- `ImmutableBytes` or `ReadonlyBytes`;
- `SnapshotPropValue`;
- possible `SnapshotWarpState`;
- materialization API return types;
- query/property-bag byte semantics;
- storage `PropValue` versus snapshot prop value separation.

No additional cards were created.

## Recommendation For Next Cycle

Pull `IMM_snapshot-propvalue-api-model` next.

Do not resume 0096 and do not implement `ImmutableBytes` before the
snapshot value/state API model is designed. The next win is naming the
read-side snapshot model honestly.
