# Worldline Direct Read Surface

Status: DRAFT

Legend: Observer Geometry

Cycle: OG-010

## Problem

The current public doctrine says:

- pin history with `Worldline`
- shape visibility with `Observer`
- query and traverse through that read handle

That is honest, but it still leaves one important ergonomic problem:

when the caller does **not** need a filtered aperture, the "right path" still
looks like:

```js
const view = await graph.worldline().observer({ match: '*' });
```

That is too much ceremony for the most common stable-read case. It leaves
runtime-wide `graph.query()` and materialized-state inspection feeling simpler
than the pinned read path we actually want consumers to prefer.

## Sponsor Playback

### Sponsor Human

A developer should be able to:

- pin a worldline
- read one node back
- query matching nodes
- traverse relationships

without first having to introduce a no-op observer aperture.

### Sponsor Agent

A coding agent should infer:

- `Worldline` is the default stable read handle
- `Observer` is the filtered projection added when the app actually needs an
  aperture
- `graph.query()` is not the easiest path for stable reads anymore

## Design Goal

`Worldline` should be directly useful for the unfiltered stable-read path.

That means a caller who wants the full aperture of one pinned source should be
able to:

- read node properties
- run queries
- run traversals

without creating an explicit `Observer` first.

## Proposed Surface

Add direct full-aperture read helpers to `Worldline`:

- `hasNode(nodeId)`
- `getNodes()`
- `getNodeProps(nodeId)`
- `getEdges()`
- `query()`
- `traverse`

Semantics:

- they operate over the pinned `Worldline` source
- they are equivalent to an implicit observer with `match: '*'`
- they remain read-only and immutable
- they do not mutate or retarget the caller `WarpRuntime`

`Observer` remains the noun for filtered, redacted, or otherwise aperture-shaped
reads.

## README Implications

The Quick Start should teach:

1. `WarpRuntime` for opening and writing
2. `Worldline` for stable reads
3. `Observer` later, when a filtered read aperture is actually needed

That is a better progressive-disclosure story than introducing `Observer`
before the user has even asked for a projection.

## Non-goals

- no renaming of `Observer`, `Strand`, or `WarpRuntime`
- no new `Lens` public noun in this slice
- no runtime warnings or profiling counters
- no filtered-read behavior change

## Acceptance Criteria

1. `Worldline` exposes direct query/traversal and basic read helpers.
2. Those helpers stay pinned to the worldline source and do not retarget the
   caller runtime.
3. The README Quick Start uses `Worldline` directly for basic read/query/traverse.
4. `Observer` remains the documented filtered-read primitive.
