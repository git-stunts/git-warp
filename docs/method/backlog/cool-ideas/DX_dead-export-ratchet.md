---
id: DX_dead-export-ratchet
blocked_by: []
blocks: []
---

# DX_dead-export-ratchet

**Title:** Dead export ratchet — CI gate that prevents new dead exports

## Idea

182 dead exports today. The ratchet: CI counts dead exports on main. If
a PR adds new dead exports beyond the baseline, it fails. The count can
only go down (or stay the same). Over time, the codebase converges to
zero dead exports. The tool: ts-prune or a custom grep-based script. The
gate: `current_count <= baseline_count` in CI. Baseline stored in a file
like `.dead-export-baseline` committed to the repo.
