# OG-003 — Deepen Public Snapshot Immutability

Status: DONE

Promoted to: `docs/design/snapshot-immutability-hardening.md`

Completed on: `2026-03-27`

## Problem

Public materialize APIs now return detached state, but nested `Map` structures
are still writable by callers in their local copy.

## Why This Matters

The current slice fixed aliasing, not full immutability. Snapshot hashing and
read-only semantics would be stronger if callers could not mutate the public
structure at all.

## Promotion Trigger

Promoted when the runtime rename was complete and the remaining read-side gap
was reduced to one concrete problem: detached snapshots still exposed mutable
nested containers.

## Outcome

This slice landed with one shared immutable-snapshot helper that now hardens:

- `WarpRuntime.materialize(...)`
- `WarpRuntime.materializeCoordinate(...)`
- `WarpRuntime.materializeWorkingSet(...)`
- `WarpRuntime.getStateSnapshot()`
- `Worldline.materialize()`

The public snapshot contract is now stronger:

- nested `Map` / `Set` mutators throw
- nested register payload objects are frozen
- detached snapshots no longer expose writable nested state through ordinary
  caller operations
