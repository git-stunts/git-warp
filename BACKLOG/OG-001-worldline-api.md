# OG-001 — First-Class `Worldline` API

Status: DONE

Promoted to: `docs/design/worldline-observer-api-phasing.md`

## Problem

Read-side coordinates are still expressed indirectly through mutable
`WarpRuntime` session handles instead of a first-class history noun.

## Why This Matters

The observer rewrite is not complete until callers can target immutable history
through a proper `Worldline` API rather than by treating `WarpRuntime` as both a
session and a snapshot.

## Promotion

This item was promoted when the next slice began defining the public read-side
API shape after the detached observer-boundary repair work.

## Outcome

The minimal first-class `Worldline` surface landed on 2026-03-27:

- `WarpRuntime.worldline()` now returns a worldline handle
- `Worldline.materialize()` resolves detached snapshots
- `Worldline.observer()` creates observers pinned to the worldline source
- `Worldline.seek()` returns a new worldline handle

Further work on tick-indexed coordinates and richer worldline identity now
belongs to later slices rather than this initial noun-introduction item.

See also:

- `docs/design/worldline-observer-api-phasing.md`
- `docs/retrospectives/2026-03-27-worldline-minimal-phase-b.md`
