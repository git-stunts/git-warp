# Retrospective: Snapshot Immutability Hardening

**Date:** 2026-03-27
**Legend:** Observer Geometry
**Cycle:** Public snapshot immutability
**Backlog:** `OG-003`
**Design:** `docs/design/snapshot-immutability-hardening.md`

## What Landed

- Added a shared immutable snapshot helper in
  `src/domain/services/ImmutableSnapshot.js`.
- Wired that helper through all public state-returning read paths:
  - `WarpRuntime.materialize(...)`
  - `WarpRuntime.materializeCoordinate(...)`
  - `WarpRuntime.materializeStrand(...)`
  - `WarpRuntime.getStateSnapshot()`
  - `Worldline.materialize()`
- Strengthened the read-side spec so public snapshots now reject ordinary
  `Map` / `Set` mutation and freeze nested property payload objects.

## Design Alignment Audit

- `aligned` — public snapshots no longer alias mutable runtime cache state.
- `aligned` — nested `Map` / `Set` mutators now throw on returned snapshots.
- `aligned` — `createStateReaderV5(...)` still works on hardened snapshots.
- `aligned` — the hardening is shared across live, coordinate, strand, and
  `getStateSnapshot()` paths rather than implemented piecemeal.
- `partially aligned` — the stronger public `WarpState` noun did not land here.
  That remained outside the scope of `OG-003`.
- `partially aligned` — immutability is honest for normal callers, but this
  slice does not attempt adversarial-proof hardening against deliberate
  prototype abuse.

## Drift

There was no substantive semantic drift from the design note. The main
adjustment was implementation detail:

- a plain deep freeze was rejected after validating that `Object.freeze(Map)`
  does not stop `Map#set/delete`
- the landed implementation therefore uses proxy-backed read-only `Map` / `Set`
  facades with bound read methods

## Why The Adjustment Happened

- hidden pre-existing constraint: JavaScript collection freezing is weaker than
  it looks at first glance

## Resolution

- accepted and encoded in the implementation
- reflected directly in the design note
- no follow-on correction is required for this slice

## Verification

- `npx vitest run test/unit/domain/WarpGraph.observerBoundary.test.js test/unit/domain/WarpGraph.worldline.test.js test/unit/domain/WarpGraph.seekDiff.test.js`
- `npx vitest run test/unit/domain`
- `npm run typecheck`
