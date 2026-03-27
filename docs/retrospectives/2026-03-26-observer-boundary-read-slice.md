# Retrospective — Observer Boundary Read Slice

Date: 2026-03-26

## Scope

This slice focused on the immediate blocker in the substrate-alignment tranche:
stop treating public read materialization as a shared mutable graph retargeting
API.

## What Landed

- Added a dedicated red spec for the observer/materialization boundary in
  `test/unit/domain/WarpGraph.observerBoundary.test.js`.
- Changed public `materialize()`, `materializeCoordinate()`, and
  `materializeWorkingSet()` returns to be detached from the caller graph's live
  cached state.
- Moved coordinate and working-set public materialization onto detached graph
  handles so read calls no longer retarget the live graph instance.
- Updated observer snapshot construction to work from returned detached state
  rather than assuming the detached graph was mutated in place.
- Reconciled legacy tests that were still asserting the old retargeting
  behavior.

## What We Learned

- The old API shape leaked mutable session semantics deep into the test suite.
  Once the read boundary was made explicit, the regression surface was larger in
  tests than in production code.
- Receipt-enabled materialization had the same aliasing assumption as the
  ordinary read path. The safer contract needed to be enforced in both places.
- `observer()` was already the closest thing to the intended design. The public
  materializers were the main source of semantic drift.

## What Remains

- Public snapshots are detached, but they are not yet deeply immutable in the
  strict sense. Callers can still mutate nested `Map` structures in their own
  copy.
- `Worldline` is still a design noun, not a first-class runtime API.
- The current mutable/session `WarpGraph` type still carries too many roles.

## Verification

- `npx vitest run test/unit/domain/WarpGraph.observerBoundary.test.js`
- `npx vitest run test/unit/domain/WarpGraph.workingSets.test.js`
- `npx vitest run test/unit/domain/WarpGraph.receipts.test.js`
- `npx vitest run test/unit/domain`
