# Retrospective: Observer Public Noun Cut

**Date:** 2026-03-27
**Legend:** Observer Geometry
**Cycle:** `OG-010`
**Design:** `docs/design/observer-public-noun-cut.md`, `docs/design/public-api-stratification.md`

## What Landed

- Renamed the public read-handle class from `ObserverView` to `Observer`.
- Updated `index.js`, `index.d.ts`, and the declaration-surface manifest so the
  public export/type contract now uses `Observer` only.
- Updated `graph.observer(...)` and `worldline.observer(...)` return signatures
  to `Promise<Observer>`.
- Added `test/unit/scripts/public-api-observer-noun.test.js` so the runtime
  export and declaration text are both pinned by executable spec.
- Updated the consumer typecheck fixture to compile against `Observer`.
- Updated the active public docs and API stratification note so README and Guide
  teach `Observer` rather than `ObserverView`.

## Design Alignment Audit

- `aligned` — the public noun is now `Observer`, not `ObserverView`.
- `aligned` — the public runtime export no longer exposes `ObserverView`.
- `aligned` — the public type surface no longer declares `ObserverView`.
- `aligned` — `graph.observer(...)` and `worldline.observer(...)` now return
  `Observer`.
- `aligned` — the consumer compile fixture now encodes the intended noun.
- `aligned` — the active public docs and current API stratification note now
  teach `Observer` consistently.
- `partially aligned` — historical RFCs, changelog entries, and prior
  retrospectives still contain the older noun.

## Drift

There was no semantic drift from the governing design note.

One deliberate scope boundary remains:

- this slice corrected the live public contract and active docs
- it did not attempt repository-wide historical wording cleanup

## Why The Adjustment Happened

- deliberate tradeoff: the value of this slice was to stop teaching the wrong
  public noun immediately without turning the work into a documentation-archive
  rewrite

## Resolution

- accepted as the correct slice boundary
- historical mentions of `ObserverView` remain follow-on cleanup, not drift
  inside this slice

## Verification

- `npx vitest run test/unit/scripts/public-api-observer-noun.test.js test/unit/domain/index.exports.test.js test/unit/domain/services/Observer.test.js`
- `npm run typecheck:consumer`
- `npm run typecheck:surface`
- `npx vitest run test/unit/scripts/public-api-readme-shape.test.js test/unit/scripts/read-api-doc-consistency.test.js`
- `node scripts/lint-markdown-code-samples.js README.md docs/GUIDE.md`
