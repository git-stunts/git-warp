---
id: PROTO_ttd-merge-inspector
feature: merge-strands-worldlines
blocked_by:
  - PROTO_merge-classifier
  - PROTO_merge-runtime-noun-family
blocks: []
title: TTD merge inspector
rank: 3
lane: up-next
cluster: merge-geometry
impact: high
effort: medium
confidence: high
---

# TTD merge inspector

`warp-ttd` should grow a merge inspector that shows merge as a causal object,
not a failed text splice.

Minimum view:

- shared precursor
- branch A / branch B strands
- footprints and overlap
- candidate canonical join if one exists
- obstruction witness if one does not
- possible lowerings / rendered public surfaces

Why this matters:

- It operationalizes the merge-geometry work immediately.
- It gives humans and agents the same observer-native merge surface.
- It makes enriched merge objects legible instead of theoretical.

Work:

- define the debugger protocol shape for merge inspection
- render at least one simple domain in a first pass: JSON/object merge
- make room for `ConflictWitness`, `LoweringWitness`, and `PolicyRequirement`
- keep the first cut observer-first and read-only

## Source

- `docs/design/merge-geometry-and-theorem-spine.tex`
- `docs/design/merge-lifting-worked-examples.tex`
- `warp-ttd` / observer-native read-surface discussion
