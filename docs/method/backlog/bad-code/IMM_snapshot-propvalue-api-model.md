---
id: IMM_snapshot-propvalue-api-model
blocked_by: []
blocks:
  - 0101-readonly-byte-propvalue-snapshot
  - 0096-purge-cast-hacks
feature: materialization-snapshotting
release_home: v17.0.0
---

# Design immutable snapshot prop value API model

**Effort:** L

0101 proved that byte-valued public immutable snapshots cannot honestly
reuse storage-shaped `PropValue` when byte values need runtime
immutability.

Storage `PropValue` may include mutable `Uint8Array`. Snapshot prop
values likely need a distinct immutable byte value, such as
`ImmutableBytes` or `ReadonlyBytes`, and therefore a distinct snapshot
value/state model.

## Problem

`createImmutableWarpStateSnapshot` currently returns `WarpState`.
`WarpState.prop` is typed as `Map<string, LWWRegister<PropValue>>`, and
`PropValue` is the storage/value-decoding union. Adding
`ImmutableBytes` to that union would collapse storage semantics and
snapshot semantics into one bag.

That would make the type model less honest, not more.

## Acceptance

- Define an explicit runtime-backed immutable byte value, such as
  `ImmutableBytes` or `ReadonlyBytes`.
- Define `SnapshotPropValue`.
- Decide whether immutable snapshots return `SnapshotWarpState` instead
  of `WarpState`.
- Decide how materialization APIs expose immutable snapshot state.
- Decide how query/property-bag APIs relate to snapshot value semantics.
- Decide whether storage `PropValue` and snapshot `SnapshotPropValue`
  remain separate permanently.
- Avoid proxy-backed fake `Uint8Array` immutability.
- Avoid `Readonly<Uint8Array>` compile-time theater.
- Avoid broad generic snapshot protocol work.
- Avoid fake `WarpState` return types if snapshot values differ from
  storage values.
- Document any public migration/API note if return types change.

## Source

Created from 0101 after the proxy-backed `Uint8Array` GREEN attempt was
rejected as preserving the wrong public representation.
