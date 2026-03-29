# Retrospective — Observer Seek Phase A

Date: 2026-03-27

## Scope

This slice implemented the first public seek contract for observers without
introducing the full `Worldline` API yet.

## What Landed

- Added `ObserverView.seek()` as an immutable read-side operation.
- Added factual observer metadata:
  - `observer.source`
  - `observer.stateHash`
- Added explicit live observer source support alongside coordinate and
  strand sources.
- Extended the observer boundary spec to prove:
  - seeking returns a new observer
  - explicit coordinate seek works
  - strand seek works
  - the caller graph is not retargeted by seek

## What We Learned

- The missing concept was not just `Worldline`; it was a lawful read handle
  contract. Landing `seek()` first made the next `Worldline` slice much more
  concrete.
- The existing observer implementation was already close. The important missing
  pieces were source metadata and an explicit rehydration path.
- `observer()` default creation still depends on current graph materialization
  when no explicit source is supplied. That is acceptable for now, but the
  eventual `Worldline` surface should make source selection more explicit.

## What Remains

- Introduce the first-class `Worldline` noun.
- Decide how much of the legacy `WarpGraph.observer(...)` entry point remains
  once `Worldline` exists.
- Revisit whether default live observer creation should continue to depend on
  the caller graph's current materialized state or move fully to explicit live
  detached reads.

## Verification

- `npx vitest run test/unit/domain/WarpGraph.observerBoundary.test.js`
- `npx vitest run test/unit/domain/services/ObserverView.test.js`
- `npx vitest run test/unit/domain`
