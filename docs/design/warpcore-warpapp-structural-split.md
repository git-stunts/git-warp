# WarpApp And WarpCore Structural Split

Status: DESIGN

Legend: Observer Geometry

Cycle: OG-010

## Decision

`v15` should make the product/core split structural.

`git-warp` should expose:

- `WarpApp` as the default, curated product-facing root
- `WarpCore` as the full plumbing and tooling-facing root

The existing engine implementation may remain one underlying runtime
internally, but the public API should stop presenting one flat `WarpRuntime`
surface as the primary story.

The compatibility-alias decision in this note is superseded by
[warpruntime-public-cut.md](warpruntime-public-cut.md), which removes the
public `WarpRuntime` export entirely for `v15`.

## Why This Cut Is Worth Doing Now

The IBM cycle already established:

- app builders repeatedly learned the wrong path from the flat public surface
- agents infer usage from signatures and examples, not from architecture papers
- TTD and debugger tooling still need honest access to substrate mechanics

A docs-only split is not enough. The cost model should become structural.

This is an appropriate major-version moment because:

- `15.0.0` is already intentional
- public nouns and onboarding are already being reworked
- higher-layer misuse has already shown that prose alone is not sufficient

## Public Shape

### `WarpApp`

Default export and primary entrypoint for building apps.

It should make these operations feel normal:

- open a graph for product usage
- write patches
- sync
- subscribe/watch
- create pinned reads through `Worldline`
- shape reads through `Lens` and `Observer`
- work with speculative lanes and braid

It should not expose low-level whole-state inspection or direct replay helpers
as ordinary methods.

Instead, it should provide:

- `core()` -> explicit access to `WarpCore`

That keeps the escape hatch honest.

### `WarpCore`

Named export for tooling, debugger, provenance, replay, migration, and bounded
inspection work.

It should expose the full existing low-level surface, including:

- `materialize*()`
- whole-state inspection
- root-scoped query/traverse
- provenance / receipt / BTR helpers
- comparison / transfer helpers
- checkpoint / lifecycle mechanics
- lower-level fork and replay operations

This is the right root for TTD and similar tooling.

## Method Placement

### `WarpApp` methods

Initial curated surface:

- `open(...)`
- `graphName`
- `writerId`
- `core()`
- `writer(...)`
- `createWriter(...)`
- `createPatch()`
- `patch(...)`
- `patchMany(...)`
- `syncWith(...)`
- `worldline(...)`
- `observer(...)`
- `translationCost(...)`
- `subscribe(...)`
- `watch(...)`
- working-set / speculative methods:
  - `createWorkingSet(...)`
  - `getWorkingSet(...)`
  - `listWorkingSets()`
  - `braidWorkingSet(...)`
  - `dropWorkingSet(...)`
  - `createWorkingSetPatch(...)`
  - `patchWorkingSet(...)`
  - `queueWorkingSetIntent(...)`
  - `listWorkingSetIntents(...)`
  - `tickWorkingSet(...)`

### `WarpApp` intentionally omits

- `materialize()`
- `materializeCoordinate()`
- `materializeWorkingSet()`
- `materializeSlice()`
- `getNodes()`
- `getEdges()`
- `getNodeProps()`
- `neighbors()`
- `getStateSnapshot()`
- root `query()` / `traverse`
- provenance / conflict / comparison / transfer / checkpoint plumbing

### `WarpCore` methods

`WarpCore` should remain the honest "everything below the product veneer"
surface. For this slice, the simplest rule is:

- `WarpCore` exposes the full current plumbing API

That keeps TTD and advanced tooling unblocked while `WarpApp` becomes the
safer primary story.

## One Engine, Two Facades

This cut should not fork the engine implementation.

Preferred implementation shape:

1. keep one underlying runtime implementation
2. let `WarpCore` adopt or wrap that runtime with the full surface
3. let `WarpApp` wrap `WarpCore` with a curated subset

This preserves:

- one source of truth for runtime behavior
- one sync/materialization/provenance implementation
- one hexagonal substrate core

while changing what public users reach for first.

## Sync Boundary

`WarpApp.syncWith(...)` should remain product-facing because deterministic
multi-writer sync is part of the main WARP value story.

It should accept:

- remote URL strings
- `WarpApp`
- `WarpCore`

and unwrap to the underlying runtime/core as needed.

## TTD / Playback Consequence

This split does not make `PlaybackHead` public yet.

For now, it clarifies where that future noun belongs:

- not under `WarpApp`
- under the `WarpCore` / tooling stratum

That keeps the "step worldlines together" concept available for future TTD
work without polluting the first-use app surface.

## Noun Consequence

This cut resolves one of the root-noun problems:

- `WarpApp` becomes the primary app-facing noun
- `WarpCore` becomes the plumbing/tooling noun

It does **not** resolve every noun question yet.

Still open:

- `WorkingSet` vs `Strand`
- whether `PlaybackHead` ships in `v15`
- whether the public `WarpRuntime` export should be cut immediately in `v15`

## Exit Criteria

This slice is complete when:

1. `index.js` exposes `WarpApp` and `WarpCore`
2. the default export is `WarpApp`
3. the curated `WarpApp` surface omits direct materialization/inspection
4. docs teach `WarpApp` first and `WarpCore` explicitly as the escape hatch
5. tests lock the split in as the intended public structure
