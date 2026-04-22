---
id: PROTO_braid-composite-read
blocked_by: []
blocks: []
feature: merge-strands-worldlines
---

# Braid — composite read presentation across lanes

The WARP Optics working note defines:

- **Worldline**: canonical admitted causal lane
- **Strand**: speculative causal lane
- **Braid**: composite read presentation across lanes

The codebase has worldlines and strands but no braid concept. A braid
would enable reading across multiple strands simultaneously — a
composite view that merges multiple speculative lanes into a single
read presentation.

This is related to the comparison pipeline (ComparisonController)
which already compares views across strands, but doesn't compose them
into a unified read surface.

## Source

WARP Optics working note §9, cycle 0006 noun audit.
