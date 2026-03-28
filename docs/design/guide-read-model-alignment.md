# Guide Read Model Alignment

Status: IMPLEMENTING

Legend: Observer Geometry

Cycle: OG-010

## Problem

The README now teaches the intended public read model clearly:

- write through `WarpRuntime`
- pin reads through `Worldline`
- add `Observer` only when a filtered aperture is needed
- treat broad enumeration and direct materialization as inspection or advanced
  substrate work

The long-form Guide still drifts toward the older usage pattern:

- `materialize()` first
- broad runtime reads first
- `graph.query()` as the default query surface

That creates a doctrine split inside the same repository. A reader can absorb
the correct model from the README and then immediately relearn the wrong one in
the Guide.

## Design Goal

The Guide should extend the README, not contradict it.

The early Guide path should teach:

1. open a runtime
2. write a patch
3. create a `Worldline`
4. read/query/traverse through that pinned handle
5. add an `Observer` when a filtered aperture is required
6. treat runtime-wide enumeration and direct materialization as inspection or
   substrate mechanics

## Sponsor Playback

### Sponsor Human

A developer reading the Guide should be able to move from first patch to first
stable product read without learning that app code should preload the whole
graph into memory.

### Sponsor Agent

A coding agent should infer from the Guide that:

- `Worldline` is the default stable read handle
- `Observer` is the filtered aperture handle
- `WarpRuntime.getNodes()` / `getEdges()` / `materialize()` are not the first
  tool for product reads

## Intended Constraints

- Guide Quick Start uses `Worldline` for read/query/traverse
- Guide reading section teaches product reads before substrate inspection
- Guide query section leads with `worldline.query()`
- Guide observer section builds on `Worldline`, not on runtime-first
  materialization
- Guide still documents direct runtime inspection and direct materialization,
  but those appear as bounded or advanced operations

## Non-goals

- do not remove valid low-level runtime capabilities from the Guide
- do not hide materialization or inspection from advanced users
- do not rewrite every later example in the document if the early teaching path
  and doctrinal framing are already corrected
