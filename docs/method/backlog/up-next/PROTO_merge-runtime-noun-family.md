---
title: Merge runtime noun family
rank: 1
lane: up-next
cluster: merge-geometry
impact: high
effort: medium
confidence: high
---

# Merge runtime noun family

The current merge worldview is still too binary: either a clean merged state
exists, or a generic conflict happens. The merge-geometry notes suggest a much
better runtime noun family:

- `CanonicalJoin`
- `EnrichedMerge`
- `ConflictWitness`
- `LoweringWitness`
- `PolicyRequirement`

Why this matters:

- It turns merge from `success | conflict` into a real typed result space.
- It gives `warp-ttd`, agents, and future UIs machine-readable obstruction
  objects instead of textual sludge.
- It separates canonical state composition from enriched preservation and later
  lowering.

Work:

- define each noun as a real contract/runtime object with invariants
- name what belongs to canonical state space vs enriched merge space
- define the minimum data a `ConflictWitness` must carry
- define how `LoweringWitness` differs from causal witness
- define when `PolicyRequirement` is emitted instead of forced resolution

## Source

- `docs/design/causal-lifting-and-merge-conflicts.tex`
- `docs/design/merge-geometry-and-theorem-spine.tex`
- merge-geometry discussion, 2026-04-09
