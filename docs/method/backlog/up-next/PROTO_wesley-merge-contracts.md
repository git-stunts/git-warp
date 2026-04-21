---
title: Wesley merge contracts
rank: 4
lane: up-next
cluster: merge-geometry
impact: high
effort: high
confidence: medium
---

# Wesley merge contracts

If merge is going to be lifted out of text and into structure, the contract
surface should declare the parts that determine lawful composition.

Likely declarations:

- identity / primary key rules
- singleton slots
- commutative collections
- ordered lowering surfaces
- footprint declarations
- conflict carrier types
- lowering / canonicalization policy hooks

Why this matters:

- It keeps merge behavior from becoming adapter folklore.
- It lets Wesley compile projection, footprint, conflict, and lowering
  surfaces once.
- It gives host runtimes the same merge nouns without shadow redefinitions.

Work:

- identify the smallest merge-relevant contract surface worth compiling first
- decide which parts belong to authored contract vs host policy
- generate at least one compiled merge helper family from a schema-owned source

## Release home

Likely release home: `v21`.

This should not be mistaken for `v19` doctrine/runtime cleanup. It depends on
the later merge/plurality contract story hardening first.

## Source

- `docs/design/continuum-categories.tex`
- `docs/design/observer-optics-and-effect-architecture.tex`
- merge-geometry discussion, 2026-04-09
