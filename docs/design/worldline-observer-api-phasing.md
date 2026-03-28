# RFC: Worldline And Observer API Phasing

**Status:** DESIGN
**Date:** 2026-03-27
**Legend:** Observer Geometry
**Backlog:** `OG-001`, `OG-004`
**Scope:** Public read-side phasing after the detached observer-boundary slice

> Update 2026-03-27: Phase A observer seek and the minimal Phase B
> `Worldline` surface both landed. Tick-indexed coordinates and richer
> worldline identity remain future work.

---

## Purpose

This note defines the next public read-side slices after the detached snapshot
boundary landed.

The previous slice fixed the most dangerous semantic leak: public coordinate and
strand reads no longer retarget the caller graph handle. That was
necessary, but it did not complete the read-side model.

Two gaps remain:

- there is still no first-class `Worldline` noun
- observers are pinned snapshots with no explicit seek contract

This note phases those gaps deliberately instead of pretending they should land
as one large rewrite.

---

## Current Reality

Today, git-warp exposes:

- `WarpRuntime.observer(name, config, options?)`
- `WarpRuntime.materializeCoordinate(...)`
- `WarpRuntime.materializeStrand(...)`

And `observer()` currently works like this:

1. resolve a source selector, if any
2. materialize a detached snapshot immediately
3. construct an `ObserverView` over that pinned snapshot

This means:

- observers are already immutable in practice
- observers do not currently carry source metadata
- observers do not currently support `seek()`
- the public API still has no history handle above raw coordinate selectors

That is why the long-term `Worldline` model is still absent from the actual API
surface even though the design docs already depend on it.

---

## Thesis

The next read-side tranche should land in two phases:

### Phase A — Immutable Observer Seek Over Existing Selectors

Add an explicit observer seek contract **without** requiring a full worldline
implementation first.

This phase treats the current selector surface as the coordinate vocabulary:

- live
- explicit coordinate
- strand

The key contract is:

\[
\texttt{observer.seek(source')} \to \texttt{new Observer}
\]

with the invariant that the original observer remains unchanged.

### Phase B — First-Class `Worldline` Handle

Once the seek contract exists and the read-side selector vocabulary is stable,
introduce a public `Worldline` history handle that owns:

- worldline identity
- lawful coordinate resolution
- materialization by coordinate
- observer creation

At that point, `WarpRuntime.observer(...)` becomes a compatibility surface or a
lower-level escape hatch rather than the preferred read entry point.

---

## Why This Order

Trying to land `Worldline` first would force git-warp to solve several deeper
problems at once:

- worldline identity
- coordinate representation
- history lookup
- observer construction
- seek semantics
- public type exports

That is too much for one slice.

By contrast, `Observer.seek()` can be specified now because it only requires:

- immutable observer identity
- preserved observer aperture/config
- source-aware construction
- detached snapshot materialization

Those pieces are already close at hand.

So the incremental rule is:

- Phase A proves the read-side handle semantics
- Phase B lifts those semantics onto a proper history noun

---

## Phase A — Proposed API

### New source vocabulary

The current `ObserverOptions` shape only accepts `coordinate` and
`strand`. For seekability, the explicit source vocabulary should become:

- `{ kind: 'live', ceiling?: number | null }`
- `{ kind: 'coordinate', frontier, ceiling?: number | null }`
- `{ kind: 'strand', strandId, ceiling?: number | null }`

Rule:

- omitted `source` when initially creating an observer means `live`
- once an observer exists, its effective source is explicit and inspectable

### Observer metadata

Observers should expose enough read metadata to explain what they are pinned to.

Minimum surface:

- `observer.name`
- `observer.source`
- `observer.stateHash`

This remains substrate-factual. It is not application policy.

### Seek contract

Observers gain:

```ts
interface ObserverView {
  seek(options?: ObserverOptions): Promise<ObserverView>
}
```

Semantics:

- returns a new observer
- preserves `name`
- preserves `match`, `expose`, and `redact`
- resolves a new detached snapshot
- never mutates the original observer

### Live seek behavior

If `seek()` is called with:

- no options, the observer should seek to the latest live truth
- `source.kind === 'live'`, the observer should pin the latest live truth
- an explicit coordinate or strand, the observer should pin that selector

This makes live truth a lawful source instead of an implicit special case.

---

## Phase A — Invariants

The following must hold:

1. Seeking returns a new observer handle.
2. Original and sought observers may coexist simultaneously.
3. Seeking does not retarget or dirty the caller `WarpRuntime`.
4. Two observers with the same config but different sources may report
   different visible truth simultaneously.
5. `observer.source` is factual and stable for the life of that observer.
6. `observer.stateHash` identifies the pinned snapshot seen by that observer.
7. A seek from one explicit source to another is observational only; it does
   not modify worldline history or strand state.

---

## Phase A — Test Tranche

Red-spec coverage for the next slice should prove:

1. `observer.seek()` returns a new observer and leaves the original observer
   pinned to its prior snapshot.
2. `observer.seek()` with no options seeks to current live truth.
3. `observer.seek({ source: { kind: 'coordinate', ... } })` can time-travel to
   an explicit earlier coordinate.
4. `observer.seek({ source: { kind: 'strand', ... } })` can pin a working
   set without mutating the live graph handle.
5. `observer.source` and `observer.stateHash` reflect the pinned snapshot.

This is the executable-spec boundary for Phase A.

---

## Phase B — `Worldline`

`Worldline` should follow after Phase A, not before.

Minimum expected responsibilities:

- identify a causal history lane
- resolve lawful coordinates
- materialize immutable snapshots
- create observers at a coordinate
- eventually support observer-relative seek without routing through
  `WarpRuntime.observer(...)`

### Minimal Phase B API

The first `Worldline` surface does **not** need tick-indexed coordinates yet.
It can start as a thin public history handle over the existing read-source
selector vocabulary:

```ts
type WorldlineSource =
  | { kind: 'live', ceiling?: number | null }
  | { kind: 'coordinate', frontier: Map<string, string> | Record<string, string>, ceiling?: number | null }
  | { kind: 'strand', strandId: string, ceiling?: number | null };

class Worldline {
  readonly source: WorldlineSource;

  seek(options?: { source?: WorldlineSource }): Promise<Worldline>;
  materialize(options?: { receipts?: false }): Promise<WarpStateV5>;
  materialize(options: { receipts: true }): Promise<{ state: WarpStateV5, receipts: TickReceipt[] }>;
  observer(name: string, config: ObserverConfig): Promise<ObserverView>;
}
```

And `WarpRuntime` should gain:

```ts
interface WarpRuntime {
  worldline(options?: { source?: WorldlineSource }): Worldline;
}
```

Semantics:

- `graph.worldline()` returns the canonical live worldline handle
- `worldline.seek(...)` returns a new worldline handle
- `worldline.materialize()` resolves a detached snapshot from the pinned source
- `worldline.observer(...)` creates an observer pinned to the worldline source

This is intentionally modest. It creates the first-class noun now without
pretending that tick-indexed worldline coordinates are already implemented.

The exact coordinate form is still intentionally open in this note. Existing
git-warp substrate selectors are frontier-plus-ceiling shaped, while the longer
term model wants `(worldlineId, tick)` as the semantic coordinate.

That gap should be closed deliberately in the `Worldline` design slice instead
of smuggling it into the observer-seek implementation.

---

## Non-Goals

This note does not:

- rename the mutable/session `WarpRuntime` façade yet
- require tick-indexed coordinates to exist before observer seek lands
- solve deep immutable collection representation

Those are separate slices.

---

## Recommended Next Step

Promote this note into executable spec by adding red tests for `ObserverView`
seek semantics, then implement the smallest API surface that satisfies them.
