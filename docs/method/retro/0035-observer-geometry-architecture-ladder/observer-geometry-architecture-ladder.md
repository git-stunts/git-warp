---
title: 'Observer geometry architecture ladder'
cycle: '0035-observer-geometry-architecture-ladder'
design_doc: 'docs/design/0035-observer-geometry-architecture-ladder.md'
outcome: hill-met
drift_check: yes
---

# Cycle 0035 Retro — Observer Geometry Architecture Ladder

**Status:** HILL MET

## Hill

Give the repo a canonical wall-chart for the current read/runtime doctrine:

- one glossary for core nouns
- one architecture ladder from current runtime to the target observer/optic
  model
- one release horizon for how the later majors likely harden
- one backlog ladder that turns the doctrine into implementation work

## What ground was taken

### The repo now has a canonical noun source of truth

[docs/GLOSSARY.md](../../../GLOSSARY.md) now
exists as the canonical noun source of truth.

That matters because the repo had already accumulated:

- the noun audit
- Observer Geometry notes
- optics notes
- drift audits
- runtime docs

but no single place that said:

- what each noun means
- whether it is shipped, transitional, or target-only
- how the current repo surface relates to that canonical meaning

The glossary now does that job.

### The observer/read-side runtime now has a declared target architecture

[0035-observer-geometry-architecture-ladder.md](../../../design/0035-observer-geometry-architecture-ladder.md)
turns the repo’s implicit direction into an explicit ladder.

The important move was not philosophical novelty. The important move was
runtime honesty:

- current runtime is still state-first
- target runtime should be optic/aperture/support/index/fragment driven
- the missing machinery is now named directly instead of being implied

Specifically, the cycle named these missing runtime nouns as real work:

- `Optic`
- `bounded support rule`
- `causal index`
- `support fragment`
- `materialization plan`
- `GraphDiff`
- `Witness`

### The future majors are now sketched honestly

[release-horizon-v20-v21.md](../../../design/release-horizon-v20-v21.md)
locks the horizon without pretending it is already a dependency graph.

That note gives the repo a cleaner major-version ladder:

- `v17`: clean the current engine up
- `v18`: graph substrate convergence
- `v19`: observer/doctrine/runtime convergence
- `v20`: slice-first read execution
- `v21`: distributed observer geometry and admission reality

It also records an important design law:

- global scope does not automatically imply whole-graph in-memory residency

### The ladder became backlog, not folklore

This cycle promoted four previously speculative notes into
[`docs/method/backlog/v19.0.0/`](../../../archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/v19.0.0/README.md):

- `PROTO_bounded-support-rules-for-query-surfaces`
- `PROTO_causal-indexes-for-sliced-queries`
- `PROTO_support-scoped-fragment-materialization`
- `PROTO_tick-range-graph-diff-api`

That promotion is the practical center of the cycle. It turned the
observer/read-side doctrine into tracked future runtime work.

### Cycle-boundary signposts were corrected

`docs/BEARING.md` and `docs/VISION.md` were updated at cycle close to point
readers at:

- `docs/GLOSSARY.md`
- `docs/design/0035-observer-geometry-architecture-ladder.md`
- `docs/design/release-horizon-v20-v21.md`

This keeps the signposts aligned with the new wall-chart instead of leaving the
cycle buried in the design directory.

## Verification

Passed:

- `npm exec vitest run test/unit/scripts/glossary-shape.test.ts test/unit/scripts/observer-geometry-ladder-shape.test.ts`

Key witness commits:

- `267ebfa1` — `docs(design): define observer geometry ladder`
- `e5b22c41` — `docs(design): sketch v20 v21 horizon`
- `787472ce` — `docs(design): clarify external-memory operators`
- `4a204edb` — `test(docs): ratchet glossary and ladder docs`
- `eb2e9eeb` — `docs(playback): record observer geometry ladder witness`
- `21d1362f` — `docs(drift): record ladder cycle drift`

## Playback

### Agent

1. _Can the repo now point to one canonical meaning for core read/runtime
   nouns?_
   Yes.
2. _Can a contributor explain the intended read flow without defaulting to
   whole-graph materialization?_
   Yes.
3. _Can the promoted backlog now be read as a real implementation ladder?_
   Yes.

### Human

The cycle succeeded because it did not pretend to implement the whole target
runtime. It named the target cleanly, connected it to the release ladder, and
made the follow-through visible.

## Drift

The drift was additive and acceptable:

- a separate horizon note was added because the ladder wanted a clean place to
  say what `v20` and `v21` mean
- the doc ratchet tests landed immediately instead of waiting for a later cycle
- two `up-next` notes were added to make the next follow-up cycles explicit

No negative drift undercut the main hill.

## Cycle-end upkeep

Two explicit next-cycle notes were queued in `up-next/` and later promoted into
design docs:

- [0036-warp-drift-ledger-crosslinks.md](../../../design/0036-warp-drift-ledger-crosslinks.md)
- [0037-remaining-warp-drift-release-slotting.md](../../../design/0037-remaining-warp-drift-release-slotting.md)

The backlog snapshot in
[docs/method/backlog/README.md](../../backlog/README.md)
was updated so repo-truth counts stayed honest after those notes landed.

## What remains

This cycle did **not** make the runtime slice-first.

What it did was remove the remaining excuse for vague future talk.

What remains is the implementation ladder itself:

1. doctrine/runtime reconciliation in `v19`
2. bounded support rules
3. causal indexes
4. support-scoped fragments
5. first-class diff/change surfaces
6. later major-version work to make slice-first execution and distributed
   admission/runtime semantics real

The repo is in a better place now because the nouns, the horizon, and the
backlog all point in the same direction.
