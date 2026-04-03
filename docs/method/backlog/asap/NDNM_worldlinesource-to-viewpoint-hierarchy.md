# WorldlineSource → Viewpoint class hierarchy

**Effort:** M

## Problem

`WorldlineSource` is a `{ kind: 'live'|'coordinate'|'strand' }`
discriminated union dispatched via tag switching. It violates P3/P7
of the Systems-Style manifesto.

Cycle 0005 attempted a mechanical fix and failed — the classes had
no real inheritance, no constructor validation, and kept the kind
tag for backward compatibility.

The theory audit (cycle 0006) identified a deeper problem: the name
is wrong. `WorldlineSource` is not a source of worldlines. It
specifies a **causal frontier** — the observer's point of view for
materialization. In OG-IV vocabulary, it is the `F` component of a
replica `R = (S, F, Π)`.

## Fix

Three subclasses of a `Viewpoint` base class:

- `LiveViewpoint` — current frontier (all writers, latest tips)
- `CoordinateViewpoint` — explicit frontier (pinned writer tips)
- `StrandViewpoint` — single-writer causal cone

Real `extends` inheritance. Constructor validation. `instanceof`
dispatch. `clone()` on each subclass. `Viewpoint.from()` boundary
factory for plain `{ kind }` objects.

## Breaking change assessment

`WorldlineSource` is a public API type in index.d.ts. Renaming is a
breaking change. Options:

1. Keep `WorldlineSource` as a type alias for backward compat
2. Accept the break and bump major version
3. Deprecate `WorldlineSource`, add `Viewpoint`, remove in next major

## Prerequisite

Cycle 0006 noun audit (this cycle).

## Source

Cycle 0005 retro + cycle 0006 noun audit (R2).
