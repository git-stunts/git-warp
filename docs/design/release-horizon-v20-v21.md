# Release Horizon: v20.0.0 and v21.0.0

## Why this exists

The repo now has a clear near-term major ladder:

- `v17.0.0`: TypeScript migration and bounded-residency ORSet groundwork
- `v18.0.0`: Echo-shaped graph substrate convergence
- `v19.0.0`: observation, doctrine, and slice-first runtime convergence

That is enough to sketch the next two majors honestly, without pretending
their dependency graphs are already settled.

This note exists to define the horizon at the **theme and promise** level.

It should not be read as a claim that `v20` and `v21` are lane-ready at the
same fidelity as `v17` through `v19`.

## Relationship to the architecture ladder

Read this note together with:

- [docs/GLOSSARY.md](../GLOSSARY.md)
- [0035-observer-geometry-architecture-ladder.md](./0035-observer-geometry-architecture-ladder.md)

`0035` defines the canonical noun model and the architectural ladder.
This note says how that ladder likely hardens into later majors.

## Current ladder recap

### `v17.0.0`

Clean the current engine up:

- TypeScript everywhere
- capability-first API surface
- god-object decomposition
- bounded-residency trie/ORSet line
- unified snapshot/checkpoint control plane

### `v18.0.0`

Make the graph substrate honest:

- Echo-shaped node and edge records
- attachment plane
- stable edge identity
- graph-model migration and replay proof

### `v19.0.0`

Make the read/runtime doctrine honest:

- bounded support rules
- causal indexes
- support-scoped fragments
- first-class range diff surfaces
- doctrine/runtime reconciliation for observer, admission, and strand semantics

## `v20.0.0` — Slice-First Read Execution

### Theme

Turn the slice-first observer/optic runtime from doctrine into ordinary
runtime behavior.

### User-facing promise

Local questions should stop paying whole-graph default costs.

Examples of what should feel materially better:

- diffing intervals
- asking what changed for one entity or scope
- neighborhood and local-site reads
- restoring read support from reusable fragments
- reading large result sets without assuming they fit in memory at once

### Likely user-facing changes

- first-class `graph.diff(...)` or equivalent interval-change surface
- iterator / stream / page-oriented read APIs where current surfaces force
  `Promise<T[]>`
- support-scoped reuse becoming normal in the runtime instead of hidden
  behind one global `_cachedState`
- clearer cost surfaces: local reads, global reads, and degraded fallbacks
  should no longer look the same

### What must be true before `v20` hardens

- `v18` graph substrate convergence must have landed
- `v19` must have established the noun law for optics/apertures/support
- at least one bounded-support read path must be proven in real runtime
- at least one causal-index family must be real, not just a design note

### What should not be faked early

- do not claim “streaming” if the implementation still buffers whole graph
  state and only streams the final array
- do not claim “slice-first” if the runtime still materializes whole state and
  then narrows it after the fact
- do not equate “global question” with “must fit in RAM”

### Likely first-class backlog themes

- stream/page-shaped read APIs
- support-scoped fragment reuse in ordinary query/observer paths
- external-memory or spill-friendly global operators
- explicit cost signaling for global vs bounded reads

## `v21.0.0` — Distributed Observer Geometry and Admission Reality

### Theme

Make the plural/distributed side of WARP runtime-real:

- witnessed suffix admission
- local site / common basis work
- braid/plurality surfaces
- strand semantics that are no longer bootstrap compromises

### User-facing promise

Distributed and speculative workflows should have explicit lawful runtime
surfaces instead of being smuggled through older patch/sync mental models.

### Likely user-facing changes

- stronger admission-shell surfaces
- clearer common-basis comparison and collapse semantics
- better modeled local-site and braid reads
- observer-facing receipts/witnesses/envelopes that line up with the glossary

### What must be true before `v21` hardens

- the graph substrate must already be stable (`v18`)
- the read/runtime support model must already be real (`v19` / `v20`)
- the repo must know which plural/distributed nouns survived contact with the
  slice-first runtime

### What should not be faked early

- do not harden strand/braid nouns before the slice-first read model settles
- do not turn doctrine prose into runtime guarantees prematurely
- do not mix distributed admission law with unresolved local read execution
  gaps

### Likely first-class backlog themes

- witnessed suffix admission shells
- local-site objects and common-basis comparison
- receipt/envelope boundary clarification
- public noun cleanup after the runtime proves the new shapes

## Streaming and memory horizon

The medium-term rule should be:

- **local questions** get bounded support and should become streamable or
  page-shaped when result sets are large
- **global questions** remain global in scope, but should not automatically
  imply whole-graph in-memory residency

### What "external-memory global operators" means

Some questions are honestly global:

- graph-wide aggregates
- whole-graph discovery queries
- connected-component or SCC style analysis
- topological or ordering-style passes over the whole graph

Those questions may require considering the whole graph, but they do **not**
automatically require materializing the whole graph into RAM at once.

In this note, **external-memory global operators** means implementations that
answer global questions using techniques like:

- streaming passes
- paging
- on-disk or rebuildable indexes
- chunked merges
- spill files
- external sorting
- multi-pass scans over persisted state

The important distinction is:

- **global scope** is a property of the question
- **whole-graph in-memory residency** is an implementation choice

The long-term goal is to stop conflating those two things.

That means the real future split is:

- `v20`: make bounded reads and large local result sets scale honestly
- `v21`: make plural/distributed semantics ride on top of that honest read
  substrate

## Practical planning rule

It is now reasonable to talk about `v20` and `v21` in docs and strategy
discussions.

It is **not** yet reasonable to pretend they have fully known dependency
graphs or exact release checklists.

Treat them as:

- named horizon majors
- stable theme buckets
- not-yet-hardened execution lanes
