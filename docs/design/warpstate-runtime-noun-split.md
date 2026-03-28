# RFC: `WarpState` Snapshot Noun And Runtime Split

**Status:** IMPLEMENTED
**Date:** 2026-03-27
**Legend:** Observer Geometry
**Backlog:** `OG-002`
**Scope:** Public noun split after `Worldline` and observer seek landed

> This note revises the naming proposal in
> [`docs/design/worldline-observer-strand-model.md`](./worldline-observer-strand-model.md).
> The stronger naming direction is now:
>
> - `WarpState` = immutable materialized snapshot
> - `Worldline` = history handle
> - `Observer` = read handle
> - `Strand` = speculative write handle
> - `WarpRuntime` = mutable/session substrate host

---

## Problem

The current public language still overloads `WarpGraph`.

Today, the codebase has one root object, `WarpGraph`, that acts as:

- session/runtime host
- materialization orchestrator
- checkpoint driver
- sync surface
- strand host
- observer factory

At the same time, the broader design work has been trying to reserve one noun
for the immutable materialized snapshot produced by replay.

The previous design direction proposed:

- `WarpGraph` = immutable snapshot
- `WarpState` = internal in-memory replay structure

That is coherent on paper, but it is no longer the best fit.

The word `state` maps more naturally to an immutable materialized value than the
word `graph` does. And the current root object behaves much more like an active
runtime than like a passive state value.

---

## Thesis

The cleaner long-term noun split is:

- `WarpRuntime` = mutable/session substrate host
- `WarpState` = immutable materialized snapshot/value
- `Worldline` = history handle
- `Observer` = read handle
- `Strand` = speculative write handle

That gives each noun one job:

- the runtime orchestrates
- the state is the value produced by replay
- the worldline identifies history
- the observer reads
- the strand speculates

This is a better semantic fit than preserving `WarpGraph` as the immutable
snapshot noun.

---

## Why `WarpState` Fits The Snapshot

`WarpState` is the better public name for the immutable snapshot because it is:

- value-like
- hashable
- cacheable
- read-only
- the direct result of materialization

It also lines up with how the codebase already thinks internally:

- `WarpStateV5`
- state readers
- state hashing
- state projection
- visible-state comparison

That vocabulary already points toward "state" as the thing that materialization
produces.

So the public snapshot noun should align with the implementation grain rather
than fight it.

---

## Why `WarpState` Does Not Fit The Root Object

The current `WarpGraph` host should **not** be renamed to `WarpState`.

The host object:

- owns persistence and sync
- tracks cache invalidation
- coordinates materialization
- manages strands
- creates observers and worldlines
- exposes patch/write entry points

That is not a state value. It is a runtime/orchestrator.

Calling that object `WarpState` would simply move the overload from one noun to
another.

---

## Recommended Rename Matrix

### Public nouns

- `WarpRuntime` — current root object, opened from persistence and used to
  coordinate reads, writes, sync, checkpoints, and strands
- `WarpState` — immutable materialized snapshot returned by replay
- `Worldline` — read/history handle over lawful coordinates
- `Observer` / `ObserverView` — immutable read handle over a worldline source
- `Strand` — speculative child-worldline write handle

### Internal nouns

The reducer path still needs a name for the mutable/incremental structural
state during replay. Recommended options:

- `MutableWarpStateV5`
- `WarpStateDraftV5`

Preferred direction: `MutableWarpStateV5`

Reason: it says exactly what it is, and avoids implying that the mutable replay
buffer is already the final public immutable snapshot value.

---

## Why `WarpRuntime`

The runtime host is not just storage.

It actively coordinates:

- replay
- sync
- ticking support
- checkpointing
- strand services
- observer/worldline creation

That makes `WarpRuntime` the most honest default.

Alternatives that are still acceptable:

- `WarpRepository`
- `WarpStore`

But both are slightly weaker:

- `WarpRepository` sounds Git/repo-centric and underplays runtime behavior
- `WarpStore` sounds storage-centric and underplays orchestration

So the current recommendation is:

\[
\texttt{WarpGraph} \to \texttt{WarpRuntime}
\]
\[
\texttt{WarpStateV5 (public snapshot meaning)} \to \texttt{WarpState}
\]

with a separate internal mutable-state rename later if needed.

---

## Implementation Status

This landed as a hard major-version cut in `15.0.0`, not as a compatibility
bridge.

Implemented results:

- the public runtime noun is now `WarpRuntime`
- `WarpGraph` was removed from the public export surface
- `index.d.ts` now exposes both named and default `WarpRuntime`
- the package version moved from `14.16.2` to `15.0.0`
- the read-side observer/worldline work continues on top of the renamed runtime

---

## Invariants

The rename must preserve these semantic rules:

1. `WarpState` is immutable and value-like.
2. Materialization returns `WarpState`, not a mutable session object.
3. `WarpRuntime` remains the orchestration root and does not pretend to be a
   value object.
4. `Worldline`, `Observer`, and `Strand` remain the preferred porcelain
   nouns over the runtime.
5. Hard breaks must be explicit and versioned; removed aliases must not linger
   as silent semantic traps.

---

## Executed Spec Tranche

This slice was executed as a public-surface and type-surface cut:

1. `WarpRuntime` is the default export and a named export.
2. `WarpGraph` is absent from the public export surface.
3. Runtime source imports and augmentations now target `WarpRuntime.js`.
4. Public docs/examples were updated to prefer `WarpRuntime`.

---

## Remaining Non-Goals

This note still does not:

- force the exact internal mutable-state type name in the same slice
- finish every helper/test filename cleanup immediately
- solve tick-indexed coordinate identity

Those are follow-on decisions.
