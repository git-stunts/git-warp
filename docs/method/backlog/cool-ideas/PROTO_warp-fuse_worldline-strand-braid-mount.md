---
id: PROTO_warp-fuse_worldline-strand-braid-mount
blocked_by: []
blocks: []
feature: browser-viz
---

# WARP FUSE mount for worldlines, strands, and braids

The stack now has a coherent causal model, but ordinary developer tools still
have to learn custom APIs to participate in it. That leaves a large gap
between the substrate truth and how IDEs, editors, build tools, and agent
workflows actually touch code and data.

A WARP FUSE surface would bridge that gap:

- materialize a `Worldline`, `Strand`, or `Braid` as a filesystem view
- let ordinary tools read that projection without understanding WARP directly
- translate file saves back into lawful patches on the active lane
- keep speculative work on strands by default instead of silently mutating
  canonical truth
- support explicit collapse/admission later rather than treating every save as
  canonical history

Why this matters:

- It turns worldlines and strands into everyday working surfaces.
- It gives agents and humans the same substrate-aware editor bridge.
- It makes time-travel and counterfactual workspaces native instead of
  requiring bespoke debugger UIs for every task.

Design constraints:

- reads should project through an explicit aperture or lane mount policy
- writes should normally target a strand, not canonical truth
- save semantics must handle IDE patterns honestly: temp files, rename-overwrite,
  partial writes, and generated-file churn
- path-to-graph mapping should be schema-owned, not improvised in the mount
- collapse from strand to worldline should use causal slicing, not blunt
  whole-strand promotion

Likely neighboring work:

- Wesley-compiled path/entity/attachment contracts
- explicit admission targets for filesystem-backed collapse
- debugger/session integration so a mounted strand can be inspected and forked

## Source

- Continuum / WARP runtime discussion, 2026-04-09
- Echo/git-warp/warp-ttd shared ontology review
