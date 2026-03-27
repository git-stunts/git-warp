# Retrospective: Snapshot Hash Stability Coverage

**Date:** 2026-03-27
**Legend:** Observer Geometry
**Cycle:** Public snapshot hash stability
**Backlog:** `OG-007`
**Design:** `docs/design/snapshot-hash-stability-coverage.md`

## What Landed

- Added `test/unit/domain/WarpRuntime.snapshotHashStability.test.js` as the
  executable public-API spec for snapshot hash stability.
- Proved hash equality across repeated live materialization and receipt-enabled
  live reads.
- Proved hash equality across direct coordinate reads and
  `Worldline.materialize()` for the same coordinate.
- Proved hash equality across repeated working-set reads and receipt-enabled
  working-set reads.
- Proved `getStateSnapshot()` preserves the currently materialized live hash.
- Proved `ObserverView.stateHash` remains aligned with the pinned snapshot hash
  for a coordinate observer.

## Design Alignment Audit

- `aligned` — the slice stayed entirely at the public read API boundary.
- `aligned` — repeated reads over the same history slice now have explicit hash
  coverage.
- `aligned` — receipt-enabled reads are proven hash-neutral relative to the
  returned materialized state.
- `aligned` — coordinate reads are proven hash-stable across runtime and
  worldline entry points.
- `aligned` — working-set reads are proven hash-stable across repeated and
  receipt-enabled entry points.
- `aligned` — observer `stateHash` is now explicitly tied to the pinned source
  snapshot rather than treated as an untested convenience field.
- `aligned` — the slice closed as tests-plus-docs because the runtime already
  satisfied the design contract.

## Drift

There was no semantic drift from the governing design note.

The only adjustment was scope discipline:

- the design listed six invariants
- those invariants were encoded directly in one focused spec file rather than
  spread across existing observer/worldline suites

## Why The Adjustment Happened

- deliberate tradeoff: keeping the contract in one file made the hash-stability
  surface easier to audit and less likely to drift into incidental fixture
  coverage

## Resolution

- accepted as the better expression of the design
- no follow-on correction is required for this slice

## Verification

- `npx vitest run test/unit/domain/WarpRuntime.snapshotHashStability.test.js`
- `npx vitest run test/unit/domain/WarpRuntime.snapshotHashStability.test.js test/unit/domain/WarpGraph.observerBoundary.test.js test/unit/domain/WarpGraph.worldline.test.js test/unit/domain/WarpGraph.workingSets.test.js`
