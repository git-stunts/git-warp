# Retrospective — Worldline Minimal Phase B

Date: 2026-03-27

## Scope

This slice introduced the first public `Worldline` noun without waiting for the
full tick-indexed worldline model.

## What Landed

- Added exported `Worldline` class.
- Added `WarpGraph.worldline()` as the public entry point.
- Added detached `Worldline.materialize()` across live, coordinate, and
  working-set sources.
- Added `Worldline.observer()` so observers can now be created from a
  first-class history handle rather than only from `WarpGraph`.
- Added immutable `Worldline.seek()` returning a new worldline handle.

## What We Learned

- The selector vocabulary already in git-warp was enough to introduce a real
  `Worldline` noun now. We did not need to solve tick-indexed coordinates first.
- `Worldline` becomes much easier to justify once observer seek semantics are
  already lawful and detached.
- The remaining problem is no longer “there is no history handle.” The
  remaining problem is that `WarpGraph` still carries the wrong long-term noun
  for the mutable/session façade.

## What Remains

- Decide whether the mutable/session `WarpGraph` surface is renamed, wrapped, or
  retired.
- Define richer worldline identity and eventual tick-indexed semantic
  coordinates.
- Decide whether `WarpGraph.observer(...)` remains a compatibility helper or is
  demoted more aggressively in docs and examples.

## Verification

- `npx vitest run test/unit/domain/WarpGraph.worldline.test.js`
- `npx vitest run test/unit/domain/index.exports.test.js`
- `npx vitest run test/unit/domain/WarpGraph.apiSurface.test.js -u`
- `npx vitest run test/unit/domain`
