# VISION

Status: current truth for `git-warp`.

Cycle docs freeze local decisions. This document states the repo's present
doctrine.

## One Sentence

`git-warp` is an offline-first, decentralized, append-only, multi-writer,
eventually consistent, deterministic, provenance-preserving graph system built
on Git, with observer-first read surfaces over canonical and speculative
causal lanes. It stands alone and also serves as the cold causal substrate
when used inside the wider Continuum stack.

## Thesis

`git-warp` exists because durable causal storage and hot deterministic
execution are different problems and should not be forced into one runtime.

`git-warp` owns the cold side:

- offline-first graph work without requiring a central server
- append-only causal history
- decentralized replication through Git transport
- normal sync through `git push`, `git pull`, and `git fetch` of WARP refs
- asynchronous multi-writer storage
- later convergence across hosts
- CRDT-backed eventually consistent admission
- deterministic replay and materialization
- provenance-bearing inspection surfaces
- speculative causal lanes that can later be compared or lawfully admitted

It does not try to be the hot execution substrate, the debugger, or the
application's domain semantics.

## Continuum Split

When used in the wider stack:

- `git-warp` owns cold causal storage, worldlines, strands, replay, and
  aperture-relative reads.
- Echo owns hot deterministic execution and scheduler-sensitive stepping.
- `warp-ttd` owns wide-aperture observation and explicit debugger control
  surfaces across hosts.
- Wesley owns shared schemas and generated contract surfaces for globally
  shared nouns.

This split is architectural truth, not branding.

## Core Nouns

- **Worldline**: canonical admitted causal lane. A worldline is a causal
  history, not a timeline.
- **Strand**: speculative causal lane. Durable, forkable, writable, and
  comparable without pretending to be canonical truth.
- **Braid**: composite read presentation across multiple lanes when one lane
  is not enough.
- **Observer**: a projection with basis and accumulation over a worldline,
  strand, or braid. An observer is not just a subset view and not the full
  optic.
- **Aperture**: what an observer preserves, projects, hides, or coarsens.
- **WarpState**: immutable materialized value. Useful, real, and often
  internal, but not the primary noun most applications should manipulate.
- **Receipt**: provenance-bearing operational record. Receipts carry more than
  the minimum witness needed for local reversibility.
- **Witness**: the minimum residual information needed to explain, reassemble,
  or locally reverse a rewrite or admission step.

## Primary Interaction Model

Most applications should interact with `git-warp` through observers acting on
worldlines or strands.

That means:

- application logic should usually ask for observer-relative views, traversals,
  comparisons, and provenance
- worldlines and strands should be first-class runtime truths
- explicit `WarpState` materialization should mostly serve substrate internals,
  tooling, debugger surfaces, checkpoints, and other whole-state operations

Some hosts, especially tooling such as `warp-ttd`, will materialize whole
state directly. That is normal. It is not the dominant application-facing
surface.

## Boundary Discipline

Boundary honesty is mandatory.

- decoding, parsing, hydration, and shape validation happen at ingress
- once a value becomes an admitted runtime truth, the rest of the system does
  not keep asking whether it is valid
- if you have a `WarpState`, `Patch`, `Receipt`, `WorldlineSelector`, or other
  admitted runtime value, it should already be valid
- boundary failures are rejected at the boundary, not deferred into random
  read paths

The system should not leak "maybe decoded" corridors into normal domain
behavior.

## Runtime Truth Wins

Behaviorally meaningful concepts must exist as runtime-backed truths.

The direction for this codebase is:

- fewer typedef corridors and fake constructor patterns
- fewer stringly switches for behaviorally significant branching
- more runtime-backed nouns with explicit invariants
- more `instanceof` dispatch where identity and behavior matter
- fewer ad hoc DTO shadows crossing the repo

If a concept has identity, invariants, behavior, or lawful reintegration
rules, it should not survive as a loose shape for long.

## Provenance Truth

State is not the whole truth.

`git-warp` is grounded in the following facts:

- state convergence does not imply provenance convergence
- state agreement does not imply intent preservation
- explicit conflict surfacing is better than silent erasure
- receipts, provenance, and replay structure are substrate facts, not optional
  UX garnish
- canonical history is never silently rewritten

The system should preserve enough information to answer not only "what is
true now?" but also "why did this become true?" and "what competing intents
were present?"

## Writers and Convergence

`git-warp` is built for independent writers that append without coordination
on every step.

That does not mean "all workloads are magically the same." It means:

- independent operations should commute and converge without rewind
- interfering operations must be surfaced honestly
- no last-write-wins folklore should silently burn information for heat
- suffix transport and explicit conflict objects are preferred over fake
  history surgery

The point is lawful convergence, not comforting slogans.

## Observer Geometry Orientation

Observer comparison is multi-dimensional, not scalar.

This repo therefore favors:

- multiple observer surfaces when different tasks need different fidelity
- explicit provenance, conflict, and replay views
- accumulation-aware observation instead of terminal-state worship
- task honesty over fake "one score" simplifications

The system should make it possible to ask:

- what survives projection?
- what survives accumulation?
- what was coarsened or hidden?
- what can still be replayed or explained?

## Collapse, Not Promotion

Strands are not temporary junk. They are speculative causal lanes.

When speculative work becomes canonical, the target model is not "copy the
whole strand into the worldline." The target model is strand collapse as a
WARP optic for causal slicing:

- `π`: project the relevant visible causal history
- `φ`: focus the target footprint
- `ρ`: derive the admitted canonical provenance slice
- `ω`: preserve witness for explanation and lawful reassembly
- `σ`: reintegrate the admitted slice into canonical truth

Collapse should be projection and inclusion, not destructive migration.
Shared speculative events may legitimately participate in multiple later
collapse projections.

## Humans and Agents

`git-warp` is for human developers and agent developers.

The substrate should therefore provide:

- explicit nouns instead of folklore
- inspectable receipts and provenance
- stable capability boundaries
- observer surfaces that support both narrow and wide aperture work
- lawful speculative workflows that do not require hidden host magic

Agent-first does not mean hostile to humans. It means the system should be
clear enough, explicit enough, and inspectable enough that both can work
without superstition.

## API Direction

`v17` is an alignment release, not a backwards-compatibility shrine.

The public surface should move toward:

- observer-first reads
- worldline- and strand-first causal navigation
- explicit provenance and receipt surfaces
- boundary validation that ends at the boundary
- generated or canonical shared contracts for globally shared nouns

Breaking stale APIs is acceptable when it removes sludge and makes the runtime
truth clearer. Migration notes still matter. Compatibility theater does not.

## Short Version

- `git-warp` is the cold causal substrate
- worldlines are canonical causal histories
- strands are speculative causal lanes
- observers are the primary read surface
- `WarpState` is real but not the center of the user API
- provenance and receipts are substrate truth
- collapse is lawful causal slicing, not blunt promotion
- the repo serves both human and agent developers
