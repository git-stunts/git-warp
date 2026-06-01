---
id: DX_vision-readme-namespace-consistency
feature: docs-dx
blocked_by: []
blocks: []
---

# Reconcile namespace notation across VISION.md, README.md, ARCHITECTURE.md

**Audit ref:** DQ01-H-02

VISION.md shows nested form only:
```text
graph.commitment.patches    // local tick admission
graph.folding.materialize   // frontier-relative state
```

README.md and ARCHITECTURE.md show flat form only:
```text
graph.patches
graph.materialize
```

Both forms work. No doc explains that both exist or which is preferred.

## Steps

1. Pick flat aliases (`graph.patches`) as the canonical user-facing form.
2. Document architectural form (`graph.commitment.patches`) as available
   for code that wants to be explicit about admission moments.
3. Be consistent across all docs.
