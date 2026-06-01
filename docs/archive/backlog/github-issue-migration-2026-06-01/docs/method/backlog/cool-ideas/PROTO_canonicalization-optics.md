---
id: PROTO_canonicalization-optics
blocked_by: []
blocks: []
title: Canonicalization optics
rank: 10
lane: cool-ideas
cluster: merge-geometry
impact: medium
effort: medium
confidence: high
feature: docs-dx
---

# Canonicalization optics

A lot of merge pain is not semantic conflict. It is lowering pain:

- formatting
- ordering
- serialization
- pretty-printing
- redaction / surface shaping

Treat canonical rendering as its own optic-bearing lowering layer instead of
smuggling it into the merge itself.

Why this matters:

- It stops formatter fights from masquerading as semantic conflicts.
- It gives `LoweringWitness` a clear home.
- It opens the door to stable public surfaces after upstairs merge.

## Source

- `docs/design/causal-lifting-and-merge-conflicts.tex`
- `docs/design/merge-lifting-worked-examples.tex`
