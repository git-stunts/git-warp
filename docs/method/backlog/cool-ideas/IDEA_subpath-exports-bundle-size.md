---
id: IDEA_subpath-exports-bundle-size
blocked_by: []
blocks: []
feature: trie-state-storage
---

# Sub-path exports to reduce default bundle size

Add granular `exports` entries in `package.json` so consumers can
import only what they need:

- `@git-stunts/git-warp/adapters` — infrastructure adapters only
- `@git-stunts/git-warp/legacy` — WarpApp/WarpCore compat layer
- `@git-stunts/git-warp/types` — type-only imports

This lets tree-shaking work better and reduces the import footprint
for consumers who only need specific capabilities.
