---
title: "Index builders consume async scan from StateSession"
cycle: "0044-index-builder-trie-iteration"
---

# Index Builders Through StateSession

## Why this exists

Cycle `0043` moved materialization onto the session-backed line, but the index
and adjacency surfaces still teach the old substrate in two places:

- `WarpStateIndexBuilder` iterates `state.nodeAlive.elements()` and
  `state.edgeAlive.elements()` synchronously
- `MaterializeHelpers.buildAdjacency()` walks `WarpState` synchronously

That leaves the runtime in an awkward half-state:

- replay is session-backed
- GC is session-backed
- but index/adjacency extraction still assumes alive-set truth only exists as a
  synchronous `WarpState`

This cycle exists to give index and adjacency building the same truthful
transition seam.

## Hill

A contributor can now answer:

- how adjacency is built from a live `StateSession` without re-teaching the
- in-memory ORSet path as the only truthful source
- how logical index builders consume async scans from trie-backed state
- where the compatibility bridge still exists for callers that only have a
  projected `WarpState`
- which runtime/materialize paths now use the session-backed surfaces directly

## Design goals

1. Add session-backed adjacency building over `StateSession`.
2. Add session-backed logical/bitmap index build surfaces over `StateSession`.
3. Keep legacy sync builders available as explicit compatibility surfaces.
4. Route session-backed materialization through the session adjacency seam.
5. Avoid fake sync wrappers or hidden eager full-state rebuilds.

## Non-goals

- No full `MaterializedViewService` rewrite in this cycle.
- No property-index substrate change; `prop` remains part of the compatibility
  frame.
- No package extraction in this cycle.
- No geometry/perf tuning in this cycle.

## Core diagnosis

The real runtime mismatch is not just one method name. It is a surface-law
problem:

- `StateSession` already owns truthful async iteration:
  - `scanNodes()`
  - `scanEdges()`
  - `nodeContains()`
  - `edgeContains()`
- index and adjacency building still derive visibility from synchronous ORSet
  iteration on `WarpState`

The honest transition is therefore:

- add `...FromSession(...)` / session-backed builder entry points
- preserve `...FromState(...)` as compatibility entry points
- move the session-backed materialization line onto the new async seams

What this cycle must **not** do is quietly convert existing sync methods into
async methods without naming the seam, or rebuild fake `WarpState` values just
to feed old index/adjacency code.

## Design

### 1. Add async adjacency building

Preferred seam:

```ts
async function buildAdjacencyFromSession(
  session: StateSession,
): Promise<{ outgoing: Map<...>; incoming: Map<...> }>
```

The legacy `buildAdjacency(state)` stays as the sync compatibility path for
callers that still only own `WarpState`.

### 2. Add async logical-index build surfaces

The builder line should gain explicit async entry points over session-backed
alive-set state. The minimum truthful shape is:

```ts
await builder.buildFromSession(session)
```

and/or:

```ts
await logicalIndexBuildService.buildShardsFromSession({
  session,
  prop,
})
```

`prop` remains part of the mixed compatibility frame until later cycles move
property state off the synchronous bag.

### 3. Use session-backed adjacency on the materialize path

When `MaterializeController` is already replaying through `StateSession`, the
returned adjacency should come from the same session-backed seam before close,
not by projecting back to `WarpState` and re-scanning synchronously.

### 4. Keep compatibility surfaces explicit

This cycle still permits:

- `WarpStateIndexBuilder.buildFromState(state)`
- `buildAdjacency(state)`

But they should now be visibly compatibility paths, not the only builder truth.

## Playback questions

### Agent

- Can I point to the exact async builder/adjacency surfaces that now consume
  `StateSession`?
- Can I explain why the sync builder surfaces still exist after this cycle?
- Can I explain which runtime/materialize path now uses the async seam
  directly?

### Human

- Does the builder line now feel consistent with the session-backed replay and
  GC line?
- Is the compatibility bridge explicit rather than accidental?
- Is it clear that `prop` is the remaining mixed-state holdout?

## Test plan

### Golden path

- `WarpStateIndexBuilder` can build from `StateSession` using async scans
- session-backed adjacency matches the same logical result as sync adjacency on
  equivalent data
- `MaterializeController` on the session-backed line returns adjacency built
  from the session seam

### Edge cases

- empty session yields empty adjacency / empty index stats
- edges with missing endpoints are excluded on the session-backed path
- self-loops and multi-edges are preserved through the async seam

### Known failure modes

- closed sessions fail loudly when used for adjacency/index building
- session-backed materialization does not silently fall back to sync adjacency
  scans
- compatibility sync paths still work for existing state-only callers
