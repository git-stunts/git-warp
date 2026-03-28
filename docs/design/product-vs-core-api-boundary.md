# Product API vs Core API Boundary

Status: DESIGN

Legend: Observer Geometry

Cycle: OG-010

## Why This Note Exists

`git-warp` now has a stronger read model than it used to:

- `Worldline`
- `Lens`
- `Observer`
- detached immutable snapshots
- pinned strand reads

But the public surface still mixes two different kinds of value:

1. **primary product value**
   - the things that make WARP desirable for application builders
2. **advanced substrate value**
   - the lower-level plumbing and replay mechanics that power tooling, TTD,
     migration, debugging, and attestation

That mixed surface is the reason higher-layer apps repeatedly learned the wrong
mental model:

- materialize visible state
- enumerate whole graphs
- rebuild a second graph engine above the substrate

The fix is not to hide the substrate. The fix is to classify it honestly.

## Core Product Claim

People adopt `git-warp` because they want:

- multi-writer graph collaboration without central coordination
- offline-first operation over a Git-backed substrate
- deterministic CRDT convergence
- pinned historical reads instead of one mutable "latest only" state
- speculative lanes that can diverge without silently mutating canonical truth
- replayable, auditable history that remains available when needed

The public API should therefore make the desirable WARP behaviors feel primary,
and the plumbing behaviors feel explicit.

## Primary Product APIs

These are the features that should sell the system and define the first-use
developer experience.

### 1. Runtime / system entry

- open a graph
- write patches
- sync
- create higher-level read and speculative handles

Current nouns:

- `WarpApp`
- `WarpCore`

### 2. Pinned read history

- `Worldline`
- immutable seek across explicit coordinates
- stable query/traversal without live retargeting

This is now one of the strongest public WARP differentiators and should remain
first-class.

### 3. Aperture-shaped observation

- `Lens`
- `Observer`

This is how apps define:

- access control views
- redacted views
- product-specific read surfaces
- bounded task-specific read models

This should be treated as primary product API, not debugger jargon.

### 4. Speculative lanes

Conceptually primary:

- strands
- intent queues
- deterministic ticking
- speculative divergence from canonical history

Current public noun:

- `Strand`

Likely future product noun:

- `Strand`

This family is primary because speculative lanes are part of the product story,
not just an internal debugger trick.

### 5. Co-present lane composition

- braid / braided overlays
- lane comparison from bounded read handles
- visible composite reads over multiple lanes

This is also primary product value. It is one of the most unusual parts of the
WARP model and should eventually be presented as a product capability, not as a
buried advanced mechanism.

### 6. Product-shaped reads

- pinned query
- pinned traversal
- observer-relative read helpers

This is where app builders and agentic CLIs should spend most of their time.

## Core Coordination APIs

Some powerful WARP capabilities are real public value, but they belong to the
core/tooling stratum rather than the first-use product story.

### 1. Multi-lane playback and coordinated stepping

- `PlaybackHead`
- stepped composite frames over many lanes
- lane catalog and ancestry inspection
- explicit readable versus writable authority

This is the answer to the "step worldlines together" problem explored in
`warp-ttd`.

It is a legitimate public API because debugger/tooling consumers need it, and
some advanced apps may eventually use it. But it is not a noun most app
builders should have to learn before they can write, read, query, and sync a
graph.

`PlaybackHead` should therefore sit in the core/tooling stratum, alongside
provenance and coordinate-level replay helpers.

## Core / Substrate APIs

These remain public, but they are not the first product story.

They exist because honest tooling and infrastructure need them.

### 1. Replay and materialization

- `materialize()`
- `materializeCoordinate()`
- `materializeStrand()`
- `materializeSlice()`

These are substrate mechanics and should be framed that way.

They are legitimate public APIs for:

- TTD
- migration
- debugging
- export
- replay validation
- lower-level inspection

They are not the default app read model.

### 2. Whole-state inspection

- `getNodes()`
- `getEdges()`
- `getNodeProps()` on the root runtime
- `neighbors()` on the root runtime
- `getStateSnapshot()`
- direct runtime `query()` / `traverse`

These are bounded inspection/admin surfaces, not normal product hot paths.

### 3. Provenance / audit / attestation

- receipts
- provenance queries
- BTRs
- wormholes
- audit receipts
- causal comparison facts

These are essential for tooling and correctness, but they are not the main
thing most app builders should see first.

### 4. Transfer / comparison / settlement tooling

- compare coordinates
- compare strands
- transfer plans
- scope-aware fact exports

These are substrate truth APIs that higher layers may depend on, but they are
not the first API a normal product developer should reach for.

### 5. Storage / performance / lifecycle mechanics

- checkpoints
- GC
- seek cache
- index rebuild/load
- sync plumbing
- content-addressed storage plumbing and `git-cas`-adjacent lifecycle concerns

These belong in the public surface, but in a clearly secondary or advanced
stratum.

## Why TTD Matters Here

The existence of `warp-ttd` is a strong argument **against** hiding the core
APIs.

TTD needs honest access to:

- replay at explicit coordinates
- immutable snapshots
- provenance and receipts
- comparisons
- fork/speculation hooks
- multi-lane playback coordination inputs
- stepped composite frame control via `PlaybackHead`

That means the substrate APIs must remain public.

The lesson is not "hide core."

The lesson is:

- keep product APIs primary
- keep substrate APIs explicit
- do not flatten both onto one undifferentiated root surface

## Chosen Public Shape

`v15` should expose one underlying engine through two public roots:

- `WarpApp`
- `WarpCore`

with:

- `WarpApp` as the primary product-facing surface
- `WarpCore` as the honest plumbing/tooling-facing surface
- one underlying runtime implementation beneath both
- `app.core()` as the explicit escape hatch from product code into substrate
  mechanics

## Current Recommendation

The strongest current direction is:

1. keep one underlying runtime implementation
2. make the **product API stratum** and **core API stratum** structural through
   `WarpApp` and `WarpCore`
3. keep `WarpApp` curated and intentionally smaller than the core surface
4. do not release v15 until this split is explicit in the public docs, type
   surface, and runtime exports

My current bias is:

- the split should be structural, not prose-only
- `Worldline`, `Lens`, `Observer`, speculative lanes, and braid belong to the
  product-facing stratum
- `PlaybackHead`, provenance, coordinate replay, and settlement/comparison
  mechanics belong to the core-facing stratum
- replay/materialization/provenance/attestation/comparison/export belong to the
  core stratum

## Hexagonal And Cross-host Consequence

This split aligns with the broader hexagonal direction:

- product-facing app ports should depend on the product stratum
- debugger/tooling adapters should depend on the core stratum
- Git-specific storage and transport details should remain adapter concerns, not
  the main product story

It also aligns with the future Echo/Wesley compatibility goal:

- product nouns should be strong candidates for host-agnostic shared contracts
- core nouns should describe honest replay, playback, provenance, and
  comparison mechanics that TTD can rely on across hosts
- Git-specific implementation details should not become the shared conceptual
  surface

## Method Placement Draft

### Product-facing stratum

- open graph
- patch / writer
- sync
- `app.core()`
- `worldline()`
- `Worldline.seek()`
- `Worldline.query()`
- `Worldline.traverse`
- `Worldline.observer()`
- `Observer.query()`
- `Observer.traverse`
- strand / strand creation and normal speculative workflows
- braid composition where it participates directly in normal app behavior

### Core-facing stratum

- `materialize*()`
- direct root `getNodes()` / `getEdges()` / `getNodeProps()` / `neighbors()`
- `getStateSnapshot()`
- `PlaybackHead` creation/selection/step/seek once exposed concretely
- receipts / provenance
- BTR / wormhole
- coordinate / strand comparison
- transfer plans
- checkpoint / GC / index / seek-cache lifecycle mechanics

## Open Questions

1. Should direct root `query()` / `traverse` remain in the product-facing
   stratum, or should those also move to explicit inspection/core placement?
2. Should speculative lanes ship in v15 under `Strand`, or is the noun cut
   to `Strand` important enough to do before release?
3. Is braid mature enough to foreground as a primary feature, or should it
   remain documented but secondary in v15?
4. Should `PlaybackHead` ship as a first-class public noun in v15, or remain a
   design-level core concept until the first `warp-ttd` integration slice lands?
