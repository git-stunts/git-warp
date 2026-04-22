---
id: VIZ_graph-diff-transitive-reduction
blocked_by: []
blocks: []
feature: browser-viz
---

# Graph diff via transitive reduction comparison

Compute `transitiveReduction(graphA)` and
`transitiveReduction(graphB)`, diff those minimal edge sets. Much
more compact structural summary than raw edge-set diff — strips
implied edges, shows only load-bearing structural changes.

Could feed into time-travel delta engine as
`warp diff --mode=structural`.
