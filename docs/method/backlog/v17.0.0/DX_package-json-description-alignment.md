---
id: DX_package-json-description-alignment
blocked_by: []
blocks: []
---

# Align package.json description with v17 positioning

**Audit ref:** DQ01-H-05

`package.json` description says:
> "Deterministic WARP graph over Git: graph-native storage, traversal, and tooling."

README subtitle says:
> "A recursive witnessed admission architecture over Git."

The v17 positioning shift (admission architecture language) is not reflected
in the npm/JSR package description, which is what users see in search results.

## Steps

1. Update `package.json` `description` to reflect v17 positioning.
2. Ensure `jsr.json` description matches if present.
