# git-warp WARP Drift

This audit captures where git-warp currently drifts from the stronger
WARP doctrine now stabilized across the papers and cross-repo design
work.

The key pattern is simple:

- the public docs are often ahead of the code
- the code still carries older pinned-state and patch-sync assumptions
- if left alone, the implementation will teach the wrong ontology

## The current WARP baseline

The relevant baseline is now:

- **There is no canonical materialized graph.** The substrate is
  witnessed causal history; graph-like structure is an
  observer-relative reading over that history.
- **Strands are real speculative lanes, not frozen base snapshots.**
  Their realized state is basis-relative and should be resolved against
  inherited parent history plus local divergence.
- **Observers are not just filtered snapshots.** They are lawful
  read-side objects with aperture, basis, state, update law, and
  emission law.
- **Replica import is ordinary witnessed admission after
  normalization.** Sync should be described in terms of transported
  suffix claim families and explicit outcome algebra, not just
  frontier/patch exchange.

## Where git-warp is already strong

git-warp is ahead in public doctrine.

The repo already says a lot of the right things:

- commitment / folding / revelation / governance
- worldline / strand / braid / observer noun stack
- stronger read-side design docs around worldlines, observers, and
  immutable snapshots
- several invariants that already distinguish state agreement from
  provenance or observer fidelity

This is real value. It means the repo does not need a new philosophy.
It needs code and boundary cuts that stop lagging the philosophy.

## Where git-warp is drifting

### 1. Strands are still semantically centered on frozen `baseObservation`

Today the runtime still defines a strand around:

- a pinned frontier
- a frontier digest
- an optional Lamport ceiling
- a local overlay chain replayed on top of that pinned base

That is not the current target.

The stronger target is:

- a parent lane plus anchor
- local divergence that owns only the closed footprint it actually
  needs
- basis-relative realization against inherited parent history
- explicit revalidation/conflict when the parent moves inside owned
  regions

The current descriptor/materializer stack is still older than that.

### 2. Braiding is still pinned-base equality rather than common-basis normalization

Today braided overlays are rejected when `baseObservation` differs.
That keeps the implementation simple, but it is the wrong long-term
math.

The stronger target is:

- normalize claims to a common basis
- construct a plural comparison object over that basis
- preserve multiplicity where claims disagree

Byte-identical pinned base observations are too strict to be the real
semantics of braiding.

### 3. The shipped observer surface is still snapshot/materialize/filter

The current `Observer` implementation is still documented and built as
a filtered view over a materialized runtime state. `QueryController`
resolves a snapshot first and then wraps it in an observer.

That is useful infrastructure. It is not the final observer boundary.

If this hardens, the runtime will keep teaching:

- there is a graph-like thing
- then we filter it
- then we call that observation

The stronger target is:

- authored observer plan
- runtime observer instance
- emitted reading envelope with witness/budget/source metadata

### 4. Sync is still frontier comparison plus patch shipping

The sync protocol still says:

- send frontier
- compute missing writer ranges
- return patches
- apply them locally

That is coherent, and it is still older than the current WARP line.

The stronger target is:

- export witnessed suffix shells
- normalize remote claims to a comparable frontier
- admit them explicitly
- preserve shell/replay/intention semantics in the result

The current protocol is still too close to "network delta" and not yet
close enough to "witnessed import admission."

### 5. The public noun split is still only partially realized in code

The design docs correctly want a cleaner split between:

- history handle
- immutable snapshot
- observer read handle
- speculative lane
- runtime/session host

The live code still leaks the older mutable-session story in several
places. The effect is not just naming drift; it keeps materialization
and query paths more state-first than the newer doctrine wants.

## What git-warp should do next

### First: correct strand semantics

git-warp should move from:

- frozen base observation + overlay

to:

- parent lane anchor
- local divergence ownership
- basis-relative realization
- revalidation/conflict when parent drift touches owned regions

This is the most important semantic correction in the repo.

### Second: lift observers into plans and reading envelopes

The read side should stop implying that a snapshot was the thing being
observed.

The corrected boundary is:

- observer spec / plan
- runtime observer instance
- emitted reading envelope

The existing snapshot helpers can remain as implementation tools, but
they should stop masquerading as the whole revelation model.

### Third: upgrade sync into witnessed suffix admission shells

git-warp should stop centering protocol meaning on `frontier + patches`.

Frontier summaries may remain as optimization. The semantic object
should become a witnessed suffix shell, and import should return an
explicit admission outcome rather than just "applied patches."

### Fourth: keep the docs and runtime aligned

Right now the README and design notes are often ahead of the code. That
is better than the reverse, but it still creates confusion for
contributors:

- the docs promise stronger nouns
- the code still behaves in older ways

The reconciliation work should tighten both together.

## Backlog capture status

This audit has now been captured as tracked doctrine follow-through in
[`docs/method/backlog/v19.0.0/`](../method/backlog/v19.0.0/README.md).

The graph-substrate convergence cut intentionally lives in
[`docs/method/backlog/v18.0.0/`](../method/backlog/v18.0.0/README.md)
so the repo can separate "make the graph shape honest" from "finish
observer, admission, and strand doctrine convergence."

The concrete backlog items derived from this audit are:

- [HYGIENE_warp-doctrine-runtime-alignment](../method/backlog/v19.0.0/HYGIENE_warp-doctrine-runtime-alignment.md)
- [PROTO_live-holographic-strands](../method/backlog/v19.0.0/PROTO_live-holographic-strands.md)
- [PROTO_observer-plan-reading-envelopes](../method/backlog/v19.0.0/PROTO_observer-plan-reading-envelopes.md)
- [PROTO_witnessed-suffix-admission-shells](../method/backlog/v19.0.0/PROTO_witnessed-suffix-admission-shells.md)

This audit should remain the ledger for doctrine/runtime drift. The
backlog items own the implementation work.

## Relevant design context

- [worldline-observer-strand-model](../design/worldline-observer-strand-model.md)
- [observer-strand-boundary](../design/observer-strand-boundary.md)
- [worldline-observer-api-phasing](../design/worldline-observer-api-phasing.md)
- [strand-intent-ticks](../design/strand-intent-ticks.md)
- [0017 admission kernel retro](../method/retro/0017-admission-kernel/admission-kernel.md)

## Practical rule

git-warp does not need a new worldview. It needs the implementation to
stop teaching older substrate assumptions.

The important corrections are:

- a strand is not just a pinned frozen overlay session
- an observer is not just a filtered snapshot
- sync is not just patch transfer

git-warp will be strongest when its runtime does the same thing its best
docs already claim: treat reads, speculation, and distributed import as
lawful observer/admission structure over shared causal history.
