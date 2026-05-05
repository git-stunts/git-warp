---
id: PROTO_merge-classifier
feature: merge-strands-worldlines
blocked_by: []
blocks:
  - PROTO_merge-runtime-noun-family
  - PROTO_ttd-merge-inspector
title: Merge classifier
rank: 2
lane: up-next
cluster: merge-geometry
impact: high
effort: medium
confidence: high
---

# Merge classifier

The merge notes keep distinguishing three kinds of failure:

- projection conflict
- semantic conflict
- governance conflict

That distinction should not stay in docs only. The stack wants a
`MergeClassifier` that labels a merge result accordingly.

Why this matters:

- It tells us which conflicts are worth solving by causal lifting.
- It keeps the system from treating policy disputes as parser failures.
- It gives better debugger, CLI, and agent UX immediately.

Work:

- define classifier inputs: shared precursor, branch footprints, candidate join,
  obstruction witness, lowering witness availability
- define output shape and confidence rules
- prove or test the classifier on simple domains first: maps, singleton slots,
  ordered lists, imports
- surface the label in CLI/debugger output instead of one undifferentiated
  `CONFLICT`

## Source

- `docs/design/causal-lifting-and-merge-conflicts.tex`
- `docs/design/merge-lifting-worked-examples.tex`
- merge-geometry discussion, 2026-04-09
