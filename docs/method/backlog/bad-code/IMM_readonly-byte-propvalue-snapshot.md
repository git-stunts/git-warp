---
id: IMM_readonly-byte-propvalue-snapshot
blocked_by: []
blocks:
  - 0096-purge-cast-hacks
feature: materialization-snapshotting
release_home: v17.0.0
---

# Decide readonly byte PropValue snapshot semantics

**Effort:** M

0100 removed the generic immutable snapshot clone lie, but byte-valued
`PropValue` snapshots currently copy `Uint8Array` values for detachment
without making the returned byte arrays intrinsically immutable.

Detached is not immutable. A detached mutable byte copy protects the
live source, but callers can still mutate the snapshot value.

## Problem

If public read-side snapshots claim deep immutability, returning mutable
`Uint8Array` values violates that guarantee. If byte values are intended
to be detached-only, that limitation must be explicit, tested, and
documented.

## Acceptance

- Determine whether byte `PropValue` snapshots require runtime
  immutability.
- Add tests for byte-valued snapshot behavior.
- Prevent public snapshot byte mutation, or document detached-only byte
  semantics explicitly.
- Avoid fake TypeScript readonly wrappers that do not enforce runtime
  behavior.
- Avoid broad generic snapshot protocol work.

## Source

Created from the 0100 closeout correction after runtime evidence showed
snapshot byte values are detached from the source but still mutable.
