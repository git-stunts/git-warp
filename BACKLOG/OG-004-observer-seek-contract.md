# OG-004 — Canonical Immutable Observer Seek Contract

Status: DONE

Promoted to: `docs/design/worldline-observer-api-phasing.md`

## Problem

The preferred observer seek behavior is now clearer, but it is not yet enforced
as a first-class API contract.

## Why This Matters

If observer seeking mutates handles in place, the system will reintroduce the
same handle-instability that the read-boundary rewrite is removing.

## Promotion

This item was promoted when observer construction and immutable `seek()`
semantics became the next public read-side API slice.

## Outcome

Phase A landed on 2026-03-27:

- observers now expose factual `source` metadata
- observers now expose pinned `stateHash`
- `ObserverView.seek()` now returns a new observer rather than mutating the
  current one

See also:

- `docs/design/worldline-observer-api-phasing.md`
- `docs/retrospectives/2026-03-27-observer-seek-phase-a.md`
