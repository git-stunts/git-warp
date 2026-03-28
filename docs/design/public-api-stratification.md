# Public API Stratification For `git-warp`

Status: DRAFT

Legend: Observer Geometry

Cycle: OG-010

## Problem

The current `git-warp` public surface exposes substantial power, but it does
not stratify that power clearly enough.

For both human developers and coding agents, the easiest visible path still
looks too much like:

1. open `WarpRuntime`
2. call broad graph methods
3. materialize visible state
4. iterate arrays
5. rebuild product reads in application code

That is exactly the failure pattern already observed in higher-layer
applications.

The issue is not lack of capability. The issue is that the public surface does
not make the intended primitives feel primary enough, and it does not
communicate cost sharply enough when callers move into broad inspection or
substrate-mechanics territory.

## Design Goal

The public API should make these interactions feel natural:

- write/speculate through `WarpApp` and speculative-lane primitives
- pin read history through `Worldline`
- shape read visibility through `Lens` and `Observer`
- coordinate normal multi-writer app behavior without first learning replay
  internals
- ask read questions through query/traversal surfaces scoped to a worldline or
  observer
- treat full-state enumeration and direct materialization as advanced or
  inspection-oriented operations

The public API should not teach this interaction as the default product model:

- materialize whole visible state
- call `getNodes()` / `getEdges()` / `getNodeProps()` repeatedly
- build an app-local corpus or second graph
- traverse outside the substrate

## Sponsor Playback

### Sponsor Human

An app developer should be able to infer:

- `WarpRuntime` is the host/runtime and write surface
- `Worldline` is the pinned read-history primitive
- `Lens` is the aperture definition
- `Observer` is the filtered product-read primitive
- whole-state inspection APIs are not the normal first tool for product reads

### Sponsor Agent

A coding agent should be able to infer:

- start from `worldline()` when building stable read flows
- create a `Lens` when the app has a read aperture
- create `observer(...)` from that lens
- use `query()` or `traverse` on that read handle before considering state
  enumeration
- treat direct materialization and broad enumeration as advanced or bounded
  operations with explicit cost

## Proposed Public Layers

### Layer 1 — Primary Product Primitives

These are the nouns and entrypoints we want consumers to reach for first.

- `WarpRuntime`
  - compatibility alias to the core surface during the transition
- `WarpApp`
  - opening a graph for product usage
  - patching/writing
  - creating working sets
  - syncing
  - producing pinned read handles
- `WarpCore`
  - explicit core/tooling escape hatch
  - replay, inspection, and substrate plumbing
- `Worldline`
  - pinning a read source
  - seeking immutably
  - producing observers
  - advanced materialization when explicitly needed
- `Observer`
  - filtered product reads
  - scoped query/traversal
  - app-facing visibility aperture
- `Lens`
  - explicit aperture definition
  - match/expose/redact policy
  - reusable observer input
- `WorkingSet`
  - speculative write lane semantics
  - not yet fully reified as a first-class runtime object, but conceptually in
    this primary layer
- braid
  - co-present lane composition for product-visible reads
  - unusual enough to be part of the WARP value story when it is relevant

### Layer 2 — Product Read Operations

These are operations that should be presented as the normal way to answer read
questions for applications.

- `WarpApp.open(...)`
- `app.worldline(...)`
- `worldline.observer(...)`
- `observer.query()`
- `observer.traverse.*`
- `observer.hasNode(...)`
- narrowly scoped observer/local read helpers

The README and guides should lead with these operations before broad state
enumeration.

### Layer 3 — Core Coordination, Tooling, And Bounded Inspection

These operations remain public because tooling and debugger-style consumers need
them, but they should not be taught as the first-use app story.

- `PlaybackHead`
- stepped multi-lane observation
- lane catalog and braid/ancestry inspection
- coordinate comparison and settlement helpers
- provenance / receipt / BTR access
- bounded whole-state inspection and admin reads

This is the stratum where TTD, migration tooling, provenance explorers, and
advanced operators should spend more time than normal app code.

### Layer 4 — Inspection And Bounded Admin Reads

These operations are valid, but should be framed explicitly as bounded
inspection or debugging tools unless the caller has a strong reason otherwise.

- `getNodes()`
- `getEdges()`
- `getNodeProps()`
- `neighbors()`
- `getContent()` / `getEdgeContent()`
- `getStateSnapshot()`
- whole-state `query()` directly on `WarpRuntime`

These methods should be documented with explicit cost language:

- they operate over visible materialized state
- repeated loops over them can become product hot-path bugs
- they are not the recommended starting point for consumer read models

### Layer 5 — Advanced Substrate Mechanics

These APIs are real substrate capabilities, but they should not be the default
mental model presented to most consumers.

- `materialize()`
- `materializeCoordinate()`
- `materializeWorkingSet()`
- `materializeSlice()`
- causal slicing / cone inspection where present
- provenance and receipt plumbing
- `PlaybackHead` frame-resolution plumbing
- transfer planning and comparison facts
- checkpoint mechanics
- content-addressed storage / `git-cas`-adjacent lifecycle mechanics

These belong in advanced sections, not in the primary first-read path of the
README.

## Public Primitive Matrix

| Concern | Primary primitive | Secondary helper | Advanced mechanic |
| --- | --- | --- | --- |
| Open/write | `WarpRuntime` | `patch()` / `writer()` | patch-chain internals |
| Stable reads | `Worldline` | `Observer` | explicit coordinate materialization |
| Filtered product reads | `Observer` | `query()` / `traverse` | direct snapshot inspection |
| Speculation | working-set concept | working-set methods | overlay/receipt plumbing |
| Co-present reads | braid | lane selectors | braid descriptor plumbing |
| Multi-lane stepping | `PlaybackHead` (tooling/core) | frame seek/step helpers | composite-frame resolution |
| Inspection | explicit inspection methods | `getStateSnapshot()` | raw materialization |

## README Implications

The README should teach in this order:

1. what `git-warp` is
2. the main nouns:
   - `WarpApp`
   - `WarpCore`
   - `Worldline`
   - `Lens`
   - `Observer`
   - `WorkingSet`
   - braid, when product behavior needs co-present lanes
3. the default developer move:
   - write through `WarpApp`
   - read through worldline + observer
   - drop into `app.core()` only when the task is explicitly plumbing/tooling
     shaped
4. query/traversal examples over read handles
5. explicit note that TTD/debugger/tooling flows use a deeper core stratum
6. explicit inspection/admin section with cost warnings
7. advanced materialization/provenance/playback-head/working-set mechanics
   later

The Quick Start should no longer imply that product reads normally begin with
full-state enumeration on `WarpRuntime`.

## API Shaping Recommendations

### Recommendation 1

Docs and examples should prefer `WarpApp` plus `worldline()` over direct core
read methods
for pinned or repeated read flows.

### Recommendation 2

Inspection methods should be labeled and documented as inspection-oriented, not
as the default application read model.

### Recommendation 3

Direct `materialize*()` methods should remain public, but the docs should frame
them as substrate/advanced operations and make their cost and purpose explicit.

### Recommendation 4

`WarpCore.query()` should stay available, but README-first guidance should
prefer observer-scoped or worldline-scoped reads when the caller is building a
stable product read surface.

### Recommendation 5

`PlaybackHead` should be treated as a core/tooling coordination primitive over
many lanes, not as a normal app read noun. It belongs in the honest public
surface, but outside the first-use product story.

### Recommendation 6

We should consider whether a small number of question-shaped read helpers are
needed, but only after docs/test evidence shows that the current nouns plus
better teaching still leave a gap.

## Non-recommendations

This cycle should not immediately:

- hide core substrate operations behind vague façade objects
- invent app-specific read helpers
- deprecate every broad read method at once
- pretend whole-state reads are forbidden
- collapse the distinction between honest substrate mechanics and product
  ergonomics
- flatten multi-lane debugger coordination into the same story as ordinary app
  reads

## Open Questions

- Should `Worldline` eventually expose more direct query/traversal helpers, or
  is `worldline.observer(...)` the right forcing function?
- Should inspection methods be regrouped in docs under an explicit
  "Inspection API" heading without changing code names?
- Should `PlaybackHead` become a real public noun in v15, or remain design-only
  until TTD integration becomes concrete?
- Should `WorkingSet` ship unchanged in v15, or does the `Strand` noun cut need
  to happen before release?
- Is cost signaling best done through docs alone, or do we also want runtime
  warnings, profiling counters, or debug instrumentation?

## Intended Next Step

Turn this stratification into executable documentation constraints:

- README teaching-order assertions
- inspection-vs-product-read wording constraints
- public examples that work from `Worldline` / `Observer`
- explicit cost notes around whole-state enumeration and materialization
