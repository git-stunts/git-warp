# RFC: Read API Documentation Consistency

**Status:** IMPLEMENTED
**Date:** 2026-03-27
**Legend:** Observer Geometry
**Backlog:** `OG-006`
**Scope:** Reconcile public docs and examples with the detached read boundary and
the `Worldline` / `Observer` read model

---

## Problem

The runtime and tests now enforce the intended read-side boundary:

- `WarpRuntime` is the mutable/session substrate facade
- `Worldline` is the pinned read-history handle
- `ObserverView` is the filtered read projection
- coordinate and working-set materialization return detached immutable snapshots

But the public docs still teach parts of the old mental model by omission:

- pinned historical reads are still often shown as `graph.observer(..., { source })`
  instead of starting from `worldline()`
- materialized coordinate and working-set reads are shown as helper calls
  without always stating that they return detached immutable snapshots
- the prose surface does not consistently say that these reads do not retarget
  the caller runtime

That creates design drift even when the implementation is correct.

---

## Goal

Make the public read-surface docs teach the same contract that the runtime now
enforces.

After this slice, a reader of the public docs should come away with this mental
model:

1. `WarpRuntime` is the substrate/session facade.
2. `Worldline` is the explicit way to pin a live, coordinate, or working-set
   read source.
3. `ObserverView` is the preferred application-facing read handle.
4. `materializeCoordinate()` and `materializeWorkingSet()` return detached
   immutable snapshots and do not retarget the caller runtime.

---

## Invariants

The slice should make the following public-doc invariants true for
`README.md`, `docs/GUIDE.md`, and `docs/WORKING_SETS.md`:

1. pinned-read examples show `worldline()` as the explicit history handle
2. at least one observer example uses `worldline().observer(...)` or a
   `Worldline` variable followed by `.observer(...)`
3. coordinate and working-set materialization are described as returning a
   detached immutable snapshot
4. the docs explicitly say those reads do not retarget the caller runtime
5. those public docs do not reintroduce the legacy `WarpGraph` noun

---

## Non-Goals

This slice does not:

- rewrite historical RFCs that are kept for design provenance
- rename old test filenames that still include `WarpGraph`
- exhaustively normalize every internal note in `docs/design/`
- change the runtime or type surface

---

## Red Spec

Add a docs-policy test that reads the public contract docs and asserts:

- the required pinned-read / detached-snapshot phrasing is present
- the banned legacy noun is absent from the selected public docs

Then update the docs until the test passes.

That is what landed here. The runtime did not change; this slice closed by
teaching the already-correct read boundary consistently in the public docs and
backing that contract with a dedicated docs-policy test.
