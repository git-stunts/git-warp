---
id: HYGIENE_warp-doctrine-runtime-alignment
feature: observer-admission-runtime
blocked_by: []
blocks:
  - DX_observer-first-guide
---

# Keep WARP doctrine and shipped runtime teaching aligned

## Problem

`docs/audits/WARP_DRIFT.md` makes the core issue explicit: the repo's best
papers and design notes now teach a stronger WARP ontology than the
runtime actually ships.

That is better than stale theory, but it still creates contributor and
agent drift:

- docs describe target doctrine as if it were already the default
  runtime truth
- code still carries older pinned-base, snapshot-first, and
  frontier-plus-patches semantics in important surfaces
- readers can no longer tell which nouns are shipped behavior, which
  are active transition, and which are target doctrine

Without a bounded reconciliation pass, git-warp will keep teaching the
wrong ontology even when individual implementation tasks are correctly
filed.

The canonical noun source for this reconciliation is:

- `docs/GLOSSARY.md`

## What this should do

- Audit the main teaching surfaces:
  - `README.md`
  - `docs/GUIDE.md`
  - `docs/ADVANCED_GUIDE.md`
  - high-traffic API or concept docs that present observer, strand,
    worldline, braid, or sync semantics as settled runtime truth
- Mark doctrine status honestly:
  - shipped now
  - active transition
  - target model
- Cross-link the active reconciliation hills:
  - `PROTO_live-holographic-strands`
  - `PROTO_observer-plan-reading-envelopes`
  - `PROTO_witnessed-suffix-admission-shells`
- Keep `docs/audits/WARP_DRIFT.md` as the explicit ledger of where doctrine
  is ahead of implementation until the runtime catches up
- Point teaching docs at `docs/GLOSSARY.md` when they define or refine core
  read/runtime nouns

## Done looks like

- A newcomer can tell, from the docs alone, which WARP nouns are
  current runtime law versus target doctrine.
- No top-level teaching doc implies:
  - a strand is already a fully live holographic lane
  - an observer is already more than snapshot/materialize/filter
  - sync is already witnessed suffix admission
  unless the text clearly marks that as target doctrine.
- The main public docs point readers at the active backlog hills when a
  semantic correction is still in flight.
- The docs stop teaching older implementation details as timeless law
  and also stop teaching target doctrine as if it were already shipped.

## Why this is separate from the semantic cuts

The three protocol cuts change code and boundaries.

This task changes the repo's teaching contract while those code cuts
are still landing. It is documentation and doctrine hygiene, not a
replacement for the implementation work.

## Sources

- `docs/audits/WARP_DRIFT.md`
- `docs/design/worldline-observer-strand-model.md`
- `docs/design/worldline-observer-api-phasing.md`
- `docs/design/observer-strand-boundary.md`
- `docs/GLOSSARY.md`
