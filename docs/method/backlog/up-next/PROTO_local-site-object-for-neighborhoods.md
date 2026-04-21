---
title: Local site object for neighborhoods
rank: 1
lane: up-next
cluster: continuum-witness
impact: high
effort: medium
confidence: medium
---

# Local site object for neighborhoods

The Continuum lane and witness work says a local optic problem needs a real site
definition object, not just ad hoc overlap logic. In product/runtime words,
that object is a serious footprint.

`git-warp` already has footprints and patch-local structure, but it does not yet
name one explicit local site object that external consumers can rely on for:

- participating lane selection
- overlap / interference checks
- local alternative construction
- neighborhood scoping for `warp-ttd`

Work:

- identify the minimum substrate-owned site definition object for one local
  rewrite / merge / collapse site
- decide whether it should be a new runtime type or a disciplined elevation of
  existing footprint structure
- make its boundaries explicit enough to support:
  - read/write locality
  - affect boundary
  - reintegration seam
- state what parts are substrate truth and what parts remain observer-relative

Why this matters:

- lets `warp-ttd` scope worldlines and merge views by real local participation
- keeps neighborhood selection from becoming adapter folklore
- gives future merge and collapse work one stable site noun instead of repeated
  shape inference

## Release home

Likely release home: `v21`.

This note now sits on the plural/distributed side of the ladder:

- `v19` should establish the read/runtime noun law
- `v20` should make slice-first execution real
- `v21` should carry local-site and common-basis semantics as runtime truth

Do not promote this as ordinary near-term runtime cleanup just because it has a
local-sounding name.

## Source

- `PROTO_strand-collapse-optic-for-causal-slicing`
- Continuum `0006` through `0009`
