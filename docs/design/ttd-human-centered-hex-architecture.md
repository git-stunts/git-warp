# RFC: Human-Centered, Hexagonal Architecture for WARP TTD

**Status:** DESIGN
**Date:** 2026-03-26
**Scope:** Cross-host Time Travel Debugger model for git-warp, XYPH, Echo, and future WARP hosts

---

## Purpose

This note reframes the Time Travel Debugger (TTD) as a human-facing product
with a host-agnostic core, not merely as a collection of substrate inspection
commands.

The substrate remains responsible for causal truth:

- worldlines
- immutable `WarpGraph` snapshots
- observers
- working sets
- BTRs
- replay/materialization

The debugger is responsible for human tasks over that truth:

- inspect
- explain
- compare
- scrub
- fork for "what-if" exploration

That distinction matters because a WARP TTD should be able to debug:

- git-warp itself
- Echo
- XYPH
- other future WARP-based runtimes

without each host reinventing debugger semantics from scratch.

---

## IBM Design Thinking Framing

TTD is a DX system. That means the design must begin with sponsor users and
their jobs, not with storage or transport mechanics.

### Sponsor Users

#### 1. Application Developer

This person is building a WARP-powered application and needs to answer:

- what did the application see at this moment?
- what changed between these moments?
- why did the system choose this outcome?

They do not want to reconstruct BTR semantics manually.

#### 2. Substrate Maintainer

This person is debugging git-warp or Echo itself.

They need to inspect:

- replay correctness
- materialization boundaries
- receipts and counterfactuals
- provenance preservation
- observer-visible versus hidden structure

They need the debugger to be substrate-honest, not a UI that invents its own
timeline semantics.

#### 3. Systems Designer / Policy Author

This person is reasoning about:

- observer apertures
- authority boundaries
- intent visibility
- worldline forks
- transport/collapse behavior

They need to compare multiple legitimate perspectives on the same causal
history without those perspectives being flattened into one lossy story.

### Pains

Current debugger thinking tends to blur several separate concerns:

- substrate time versus human playback time
- observation versus mutation
- lane-local causality versus scene-level coordination
- raw history facts versus explanation fit for a human
- host-specific UI state versus portable debugger truth

When those are mixed together, the debugger becomes hard to trust and hard to
reuse.

### Hills

IBM Design Thinking hills force us to define a meaningful user outcome.

#### Hill 1: Single Playback Story

When an application developer opens TTD on a running WARP system, they can use
one playback surface to step through the scene and understand what changed,
what was visible, and why it happened, without having to understand the
internal lane graph first.

#### Hill 2: Same Debugger, Different Host

When a substrate maintainer debugs either git-warp or Echo, they can use the
same debugger concepts and mostly the same debugger core to inspect replay,
provenance, conflicts, and worldline structure through host adapters rather
than host-specific reimplementation.

#### Hill 3: Observation Before Speculation

When a user wants to continue execution from the past, the debugger makes the
boundary explicit: observing history is read-only, while "try from here"
creates a fork or working set instead of mutating the live past.

### Non-Goals

This design does not require:

- one global substrate clock
- one universal UI
- one storage engine
- embedding a browser debugger inside git-warp
- flattening all debugger panels into one observer

---

## Core Architectural Insight

The debugger should not be modeled as a worldline.

The debugger should not be modeled as a mutable observer either.

The clean split is:

- `PlaybackHead` is a substrate-facing coordination primitive over lanes
- `DebuggerSession` is a human/task-oriented TTD object

`PlaybackHead` belongs near the substrate because applications may also use it
to coordinate frame advancement.

`DebuggerSession` belongs above the substrate because it contains human-facing
state such as:

- selected playback head
- watched entities
- pinned panels
- chosen observers/apertures
- bookmarks
- breakpoints
- layout state
- explanation preferences

This lets the same `PlaybackHead` be used by:

- an app runtime
- a CLI inspector
- a browser TTD
- an MCP/LLM tool

without turning substrate coordination into UI state.

---

## Clean Hexagonal Architecture

The architecture should separate:

1. substrate truth
2. debugger application/use-case logic
3. delivery/presentation adapters
4. host/runtime adapters

```mermaid
flowchart TB
    subgraph ui["Delivery Adapters"]
        cli["CLI"]
        tui["XYPH TUI"]
        web["Browser TTD"]
        mcp["MCP / LLM"]
    end

    subgraph app["TTD Application Core"]
        session["DebuggerSession"]
        usecases["Playback / Inspect / Compare / Fork use cases"]
        explain["Explanation and narrative assembly"]
    end

    subgraph ports["TTD Ports"]
        catalog["Lane Catalog Port"]
        playback["Playback Control Port"]
        observe["Observation Port"]
        analysis["Analysis Port"]
        fork["Speculation Port"]
        store["Session Store Port"]
    end

    subgraph substrate["WARP Host Adapter"]
        gw["git-warp adapter"]
        echo["Echo adapter"]
        future["future WARP host adapter"]
    end

    subgraph domain["WARP Substrate Domain"]
        worldline["Worldline"]
        observer["Observer"]
        ws["WorkingSet"]
        head["PlaybackHead"]
        graph["WarpGraph"]
        btr["BTR / receipts / provenance"]
    end

    cli --> app
    tui --> app
    web --> app
    mcp --> app

    app --> catalog
    app --> playback
    app --> observe
    app --> analysis
    app --> fork
    app --> store

    catalog --> gw
    playback --> gw
    observe --> gw
    analysis --> gw
    fork --> gw

    catalog --> echo
    playback --> echo
    observe --> echo
    analysis --> echo
    fork --> echo

    gw --> domain
    echo --> domain
    future --> domain
```

### Domain Ownership

#### WARP substrate domain

Owns:

- `Worldline`
- `WarpGraph`
- `Observer`
- `WorkingSet`
- `PlaybackHead`
- replay/materialization
- receipts
- provenance
- footprints
- authority/overlap checks

Must not own:

- UI layout
- debugger panel state
- user bookmarks
- human explanation copy

#### TTD application core

Owns:

- debugger sessions
- playback use cases
- cross-panel coordination
- human-readable explanation assembly
- capability checks for UX flows
- mapping one frame to many observer panels

Must not own:

- host-specific replay internals
- direct storage mutation outside substrate ports
- fake timeline semantics that contradict substrate truth

#### Delivery adapters

Own:

- CLI parsing
- TUI interactions
- browser rendering
- MCP request/response shaping

Must not own:

- causal truth
- replay rules
- scheduling policy

---

## Why PlaybackHead Is Not The Same Thing As TTD

Humans want one scrubber and one stepper.

The substrate, however, may contain:

- many worldlines
- many working sets
- multiple observers
- partial overlap in writable footprint authority

So the correct model is:

- `PlaybackHead` coordinates a set of lanes into composite frames
- `DebuggerSession` chooses how a human inspects those frames

### `PlaybackHead`

A `PlaybackHead` is a deterministic coordinator over a set of tracked lanes.

It answers questions like:

- which lanes are in scope?
- which lanes are writable?
- what is the current composite frame?
- what happens when we step forward once?

It does **not** answer:

- which panels are open?
- which entity is selected?
- how conflicts are explained in prose
- which host UI control is highlighted

### `DebuggerSession`

A `DebuggerSession` is the human-facing composition around one or more
`PlaybackHead`s.

It answers questions like:

- what is the selected frame?
- which observer/lens is each panel using?
- which explanations are pinned?
- is the user observing or creating a speculative fork?

This keeps the core runtime reusable while allowing rich UX above it.

---

## Panels As Observer Families

Observer Geometry gives a useful discipline here: debugger panels should be
treated as different observer families over the same underlying history.

For example:

- a state inspector is a state-heavy observer
- a provenance panel is a provenance-heavy observer
- a conflict panel is an intent/conflict observer
- an access-controlled app panel is an aperture-restricted observer

The debugger should therefore avoid one giant undifferentiated "debug view."
Instead, it should coordinate multiple legitimate observer views over the same
frame.

This also explains why TTD must stay host-agnostic:

- the observer family definitions are substrate-relevant
- the panel rendering is host-specific

---

## Proposed Ports

The host-agnostic TTD core should depend on capabilities exposed through ports.

### `LaneCatalogPort`

Enumerates:

- worldlines
- working sets
- ancestry/braid relations
- available playback heads
- readable versus writable lanes

### `PlaybackControlPort`

Supports:

- create/load/select playback head
- inspect current composite frame
- seek frame
- step forward/backward
- pause/play
- detect authority overlap hazards

### `ObservationPort`

Supports:

- materialize immutable `WarpGraph` snapshots at a lane coordinate
- create observer-relative reads
- inspect visible state under a chosen aperture

### `AnalysisPort`

Supports:

- provenance queries
- receipt inspection
- counterfactual inspection
- footprint/conflict explanations
- coordinate comparisons

### `SpeculationPort`

Optional, capability-gated support for:

- fork from coordinate
- create working set
- enqueue intents
- tick working set

This port exists because "what if?" is a debugger workflow, but it must remain
explicitly separate from read-only observation.

### `SessionStorePort`

Supports persistence of human/session state such as:

- bookmarks
- watched entities
- named playback heads
- panel configurations
- saved comparisons

This is not substrate truth. It is debugger-user state.

---

## Host-Neutral Capability Model

If TTD is to debug both git-warp and Echo, the core must target a capability
contract rather than concrete implementation classes.

### Minimum read-only capability set

A host is TTD-readable if it can:

- enumerate lanes
- resolve ancestry
- materialize immutable snapshots at coordinates
- expose receipts/provenance/conflicts for those coordinates
- support observer-relative reads

### Optional speculative capability set

A host is TTD-speculative if it can additionally:

- fork from a coordinate
- create or open a working set
- admit intents
- tick deterministically

This distinction is useful because some hosts may initially support inspection
without supporting debugger-driven speculation.

---

## Invariants For The TTD Architecture

### 1. Human time is derived, not fundamental

TTD may present a single playback timeline, but substrate truth remains lane-
local. Composite debugger frames are derived from per-lane coordinates.

### 2. Observation is read-only

Debugger reads never mutate the live frontier. Continuing from the past always
requires a fork or working set.

### 3. `PlaybackHead` is not UI state

`PlaybackHead` is a reusable coordination primitive. UI/session state belongs
to `DebuggerSession` or equivalent higher-layer objects.

### 4. Panels are observer-relative

Different panels may legitimately present different observer views over the
same frame. Agreement on state is not the same as agreement on provenance or
intent.

### 5. Cross-host TTD depends on ports, not internals

The TTD core must depend only on capability ports. Host adapters translate
those ports into git-warp, Echo, or future runtime calls.

### 6. Writable authority overlap must be surfaced

If distinct playback heads control writable lanes with overlapping effective
write footprints, the system must surface an inter-head coordination hazard
before silent advancement.

### 7. Human explanation is derived from substrate facts

Narratives, annotations, and panel summaries are interpretations over receipts,
provenance, coordinates, and observer apertures. They must never become a
shadow source of truth.

---

## Consequences

This architecture implies:

- git-warp should continue to own substrate truth and thin operational
  adapters
- a broader WARP TTD can exist above git-warp without re-inventing semantics
- XYPH and Echo can share debugger concepts while keeping different UIs
- `PlaybackHead` is worth keeping as a substrate-facing noun
- `DebuggerSession` should be introduced as a separate TTD/application noun

It also implies that the debugger should be designed as a family of observers
and explanations over immutable snapshots, not as a mutable omniscient graph
console.

---

## Next Design Questions

The next design cycle should answer:

1. What is the canonical composite-frame ordering for a `PlaybackHead`?
2. Which parts of `DebuggerSession` are portable enough to standardize?
3. Which minimal wire/protocol schema would let Echo and git-warp share one
   TTD core?
4. Which debugger operations should be mandatory substrate ports versus
   optional capability extensions?
