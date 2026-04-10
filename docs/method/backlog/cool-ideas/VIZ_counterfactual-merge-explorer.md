---
title: Counterfactual merge explorer
rank: 7
lane: cool-ideas
cluster: merge-geometry
impact: high
effort: high
confidence: medium
---

# Counterfactual merge explorer

If merge is a search over lawful common futures, then the debugger should be
able to show multiple candidate lowerings and downstream consequences.

Imagine a surface that can compare:

- canonical join lowering
- explicit conflict lowering
- strand-preserving lowering
- policy-biased lowering toward A
- policy-biased lowering toward B

and then show what each choice does downstream.

This would turn merge resolution into controlled counterfactual navigation.

## Source

- merge-geometry discussion, 2026-04-09
- `docs/design/causal-lifting-and-merge-conflicts.tex`
- `docs/design/merge-lifting-worked-examples.tex`
