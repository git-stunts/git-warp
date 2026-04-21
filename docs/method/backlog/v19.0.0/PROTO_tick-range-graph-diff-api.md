# Tick-range graph diff API

**Effort:** M

## Idea

Add a first-class read API for:

```ts
graph.diff({ from: t0, to: t1 })
```

that returns an explicit graph delta:

- nodes added
- nodes removed
- nodes modified
- edges added
- edges removed
- edges modified
- node properties added / removed / modified
- edge properties added / removed / modified

This is more useful than forcing consumers to:

- run `query().match("sym:*")` at two ceilings and diff client-side, or
- manually stitch together receipts, state snapshots, and pre/post observers

## Why it fits this repo

The substrate already has most of the ingredients:

- `TickReceipt` for per-patch applied outcomes
- `PatchDiff` for per-patch structural/property winner changes
- `StateDiff` for whole-state before/after comparison

But none of them is the public noun a caller actually wants when
asking "what changed between tick `t0` and `t1`?"

## Shape

The likely honest surface is a dedicated result object, not reuse of
the current internal diff types:

```ts
graph.diff({ from: 120, to: 135 })
```

returns a deterministic `GraphDiff` with separate structural and
property sections, including edge-property deltas.

## Fast paths

- `from = to - 1`:
  use the single-patch diff/receipt path
- larger ranges:
  either merge per-patch diffs over the interval, or
  materialize `from` and `to` then compute a deterministic state diff

## Important constraint

Do not build this on top of `query().match("*")` or client-side full
scans. The point is to expose a bounded, substrate-native change API.

## Current gap

`StateDiff` currently ignores edge-property keys, so a real `GraphDiff`
API likely needs either:

- a stronger range-diff type than `StateDiffResult`, or
- a corrected `StateDiff` substrate that includes edge-property deltas

## Why this is now a real backlog item

Cycle 0035 ("Observer geometry architecture ladder") promotes this out of
`cool-ideas/` and into `v19.0.0/` because a slice-first runtime needs a
first-class change surface instead of forcing clients to synthesize diffs from
whole-state reads.
