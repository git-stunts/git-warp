# Retrospective: Observer Label Optionality

**Date:** 2026-03-27
**Legend:** Observer Geometry
**Cycle:** `OG-010`
**Design:** `docs/design/observer-label-optionality.md`

## What Landed

- `WarpRuntime.observer(...)` now supports both:
  - `observer(config, options?)`
  - `observer(name, config, options?)`
- `Worldline.observer(...)` now supports both:
  - `observer(config)`
  - `observer(name, config)`
- Unlabeled observers now default `observer.name` to `'observer'`.
- `seek()` preserves that default name.
- The public type surface and consumer fixture now encode both overloads.
- The README Quick Start now uses the unlabeled form and explains that labels
  are optional.
- The README contract spec now enforces that first-use documentation.

## Design Alignment Audit

- `aligned` — the public API now supports unlabeled observer creation.
- `aligned` — labels remain supported for descriptive app/debugger use.
- `aligned` — unlabeled observers still expose a stable `name`.
- `aligned` — `Worldline` and `WarpRuntime` now share the same optional-label
  mental model.
- `aligned` — the public type surface and consumer compile contract both reflect
  the overloads.
- `aligned` — the README now teaches the unlabeled form as the default
  first-use path.

## Drift

There was no semantic drift from the governing design note.

One deliberate scope boundary remains:

- this slice updated the README Quick Start and contract
- it did not rewrite every secondary example in the docs corpus to omit labels,
  because many named observers remain legitimate examples

## Why The Adjustment Happened

- deliberate tradeoff: the goal was to remove first-use friction without
  erasing the descriptive-label capability that still matters for debugging and
  higher-level UI semantics

## Resolution

- accepted as the correct slice boundary
- broader example cleanup remains optional follow-on work, not drift inside
  this slice

## Verification

- `npx vitest run test/unit/scripts/public-api-observer-label.test.js test/unit/scripts/public-api-readme-shape.test.js test/unit/domain/services/Observer.test.js test/unit/domain/WarpGraph.worldline.test.js test/unit/domain/WarpGraph.observerBoundary.test.js`
- `npm run typecheck:consumer`
- `npm run typecheck:surface`
- `node scripts/lint-markdown-code-samples.js README.md docs/design/observer-label-optionality.md`
