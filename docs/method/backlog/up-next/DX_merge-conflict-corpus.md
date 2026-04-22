---
id: DX_merge-conflict-corpus
blocked_by: []
blocks: []
title: Merge conflict corpus and benchmark
rank: 5
lane: up-next
cluster: merge-geometry
impact: high
effort: medium
confidence: high
---

# Merge conflict corpus and benchmark

The merge-geometry work needs a grounded benchmark corpus, not just nice
examples. We should gather a set of real conflicts from this repo and nearby
repos and classify them.

Questions to answer:

- How many conflicts are really projection conflicts?
- How many are genuine semantic conflicts?
- How many are governance conflicts?
- Which conflict classes are worth attacking first?

Work:

- collect 50-100 real merge conflicts or hand-resolution cases
- normalize them into a reproducible fixture corpus
- label each case by conflict class and domain
- measure how many disappear under simple structured lifting
- use the corpus for CLI, debugger, and future merge-engine tests

## Source

- merge-geometry discussion, 2026-04-09
- `docs/design/merge-lifting-worked-examples.tex`
