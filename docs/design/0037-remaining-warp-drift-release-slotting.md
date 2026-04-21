---
title: "Remaining WARP drift release slotting"
cycle: "0037-remaining-warp-drift-release-slotting"
---

# Remaining WARP Drift Release Slotting

## Why this exists

Cycle `0035` gave the repo a canonical noun wall-chart and a declared
observer/read-side architecture ladder.

Cycle `0036` then connected
[WARP_DRIFT.md](../audits/WARP_DRIFT.md) to those new canonical surfaces so the
audit no longer reads like an isolated pre-ladder artifact.

What still remains unresolved is the release question:

> after the observer/read-side ladder, where do the rest of the current drift
> actually land?

The remaining audit items are not one blob. They mix:

- observer/read runtime drift
- strand semantics drift
- braid/common-basis drift
- witnessed admission shell drift
- horizon uncertainty about what belongs in `v19`, `v20`, and `v21`

This cycle exists to sort that honestly.

## Canonical inputs

- [docs/audits/WARP_DRIFT.md](../audits/WARP_DRIFT.md)
- [docs/GLOSSARY.md](../GLOSSARY.md)
- [0035-observer-geometry-architecture-ladder.md](./0035-observer-geometry-architecture-ladder.md)
- [release-horizon-v20-v21.md](./release-horizon-v20-v21.md)
- [docs/method/backlog/v19.0.0/README.md](../method/backlog/v19.0.0/README.md)

## Hill

A contributor can now answer, in one place:

- which unresolved WARP drift items are still direct `v19` work
- which unresolved drift is better treated as `v20` runtime realization
- which unresolved drift should be deferred to `v21` distributed/plural
  semantics
- what new backlog notes, if any, are still missing to make that split honest

## Design goals

1. Separate the unresolved drift into distinct release bands instead of
   hand-waving “future parity.”
2. Keep the existing `v18` / `v19` split intact:
   - `v18` = graph-substrate convergence
   - `v19` = doctrine/runtime convergence
3. Clarify what `v19` must accomplish versus what `v20` and `v21` are allowed
   to own.
4. Name any missing backlog work required to keep the release schedule truthful.
5. Update the horizon story if the audit shows that `v20` and `v21` need a
   sharper thematic split.

## Non-goals

- No attempt to resolve the drift itself in this cycle.
- No attempt to pull `v20` or `v21` into detailed dependency graphs.
- No retroactive rewrite of `v18`.
- No claim that every strand/admission question is already settled.

## Core diagnosis

`WARP_DRIFT.md` currently names five areas of drift:

1. strands still centered on frozen `baseObservation`
2. braiding still modeled as pinned-base equality instead of common-basis
   normalization
3. observer surface still snapshot/materialize/filter
4. sync still frontier comparison plus patch shipping
5. public noun split only partially realized in code

After `0035`, these do not all belong in the same major anymore.

The key release-law for this cycle is:

- `v19` should own doctrine/runtime correction where the repo must stop teaching
  the wrong read-side or admission-side ontology
- `v20` should own operational slice-first execution and fragment/index runtime
  realization
- `v21` should own plural/distributed semantics that require common-basis,
  multi-lane, or stronger witnessed import structure

## Release slotting

### What belongs in `v19`

`v19` should carry the work required for the repo to stop teaching older
observer, read, and admission nouns as if they were final truth.

That includes:

- glossary-driven doctrine/runtime reconciliation
- observer plan and reading envelope surfaces
- bounded support rules as the honest execution law behind those read surfaces
- causal indexes and support fragments as runtime families that make the
  observer/optic ladder real
- first-class graph-diff / change-query surfaces so apps stop abusing full
  query scans for change detection
- the initial witnessed-suffix admission-shell boundary as a semantic object

The important constraint is that `v19` should make these nouns and contracts
real enough that the runtime stops teaching the wrong ontology, even if later
majors still deepen or scale them.

### What belongs in `v20`

`v20` should own the first real operational runtime realization of the
slice-first model declared in `0035`.

That includes:

- support-scoped fragment reuse as normal runtime behavior rather than
  provisional design language
- exact/predecessor support-fragment planning across common read paths
- change-oriented and slice-oriented APIs that avoid full-graph default
  materialization in routine reads
- external-memory and streaming execution for graph-wide operators where the
  question is global but whole-graph RAM residency is not semantically required
- first serious runtime follow-through on basis-relative strand realization once
  the doctrine surface is settled

`v20` is not where git-warp discovers the nouns. It is where those nouns start
to govern execution.

### What belongs in `v21`

`v21` should own the plural/distributed semantics that are too heavy to muddy
`v19` or `v20`.

That includes:

- common-basis braid normalization
- plural comparison objects that preserve multiplicity instead of forcing
  pinned-base equality
- stronger witnessed import/admission semantics across transported suffix
  claims
- local-site or neighborhood-object semantics if they prove necessary for the
  distributed observer geometry line
- final release-slot cleanup where public docs stop carrying transitional
  compromise nouns

`v21` is where git-warp should become honest about distributed plurality, not
just about local read execution.

## Slotting matrix

| Drift area | Release home | Why |
|-----------|--------------|-----|
| Observer surface still snapshot/materialize/filter | `v19` | This is the most immediate doctrine/runtime lie and must be corrected before later runtime scaling work. |
| Public noun split only partially realized in code | `v19` | Same reason: the repo needs the right noun and API boundary before deeper realization work. |
| Slice-first runtime realization and fragment reuse | `v20` | This is the operational execution follow-through once the doctrine and surfaces exist. |
| Strand semantics centered on frozen pinned base | `v20` to `v21` | `v19` should name and expose the right seam; the heavier basis-relative runtime realization belongs later. |
| Braiding as pinned-base equality | `v21` | This is plural/common-basis math and should not be collapsed into observer/runtime cleanup. |
| Sync as frontier + patches rather than witnessed admission | `v19` to `v21` | `v19` should introduce the correct semantic shell; fuller distributed import reality likely extends into `v21`. |

## Practical release rules

### Rule 1 — Do not turn `v19` into runtime-finality theater

`v19` should correct the surfaces and doctrine. It does not need to finish the
entire runtime in final operational form.

### Rule 2 — Do not let `v20` forget the distributed story

`v20` should make slice-first execution real, but it should not quietly
redefine plural/distributed semantics just because runtime work is underway.

### Rule 3 — Keep `v21` for true plural/distributed corrections

If a drift item fundamentally needs:

- common-basis normalization
- multi-lane comparison
- transported suffix shell comparison
- multiplicity-preserving merge objects

then it belongs in `v21` unless a smaller prerequisite seam must land earlier.

## Expected backlog outcomes

This cycle should verify that the existing promoted `v19` notes are still the
right first implementation ladder:

- `HYGIENE_warp-doctrine-runtime-alignment`
- `PROTO_observer-plan-reading-envelopes`
- `PROTO_bounded-support-rules-for-query-surfaces`
- `PROTO_causal-indexes-for-sliced-queries`
- `PROTO_support-scoped-fragment-materialization`
- `PROTO_tick-range-graph-diff-api`
- `PROTO_witnessed-suffix-admission-shells`
- `PROTO_live-holographic-strands`

It should also decide whether the horizon note needs a sharper statement that:

- `v20` = operational slice-first runtime
- `v21` = plural/distributed observer geometry and admission reality

If that split proves too fuzzy, this cycle should create one or more backlog
notes to harden it.

## Playback questions

### Agent

- If I re-read `WARP_DRIFT.md`, can I now tell which unresolved items are
  `v19`, `v20`, and `v21` work?
- Does the split keep `v19` from becoming a mushy “finish everything later”
  bucket?
- Does the slotting preserve the existing `v18` / `v19` release law?

### Human

- Does the release horizon now feel believable instead of vague?
- Can I explain why strand/braid/admission work does not all belong in one
  major?
- Does the release split feel like it reduces confusion rather than just
  spreading future work across more labels?

## Test plan

This is a docs-only design cycle.

### Golden path

- the design doc names each unresolved drift family and assigns it to a release
  home
- the slotting is consistent with `v18`, `v19`, and the horizon note
- the doc explicitly preserves the `v18` graph-substrate cut as separate from
  the doctrine/runtime ladder

### Edge cases

- drift items that straddle releases are called out as split seams instead of
  being forced into one bucket
- the doc distinguishes semantic surface correction from runtime realization
- the doc distinguishes local read execution from plural/distributed semantics

### Known failure modes

- collapse all unresolved drift into `v19`
- push all hard questions out to `v21`, leaving `v19` mushy
- quietly undo the `v18` / `v19` split by smearing substrate work back into
  doctrine work
- produce a horizon note that sounds clean but cannot be mapped back to the
  actual drift ledger
