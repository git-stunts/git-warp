---
id: DX_warpapp-deprecation-warning
blocked_by: []
blocks: []
feature: api-capabilities
---

# Add deprecation warning to WarpApp default export

**Audit ref:** CQ01-1.2

`index.js` exports `WarpApp` as the default export (`export default WarpApp`).
A consumer using `import WarpApp from '@git-stunts/git-warp'` gets the
deprecated API with no compile-time or runtime warning.

## Steps

1. Add `@deprecated` JSDoc annotation to the WarpApp default export in
   `index.js`.
2. Add a `console.warn` in `WarpApp.open()` for v17 to guide migration:
   ```
   [git-warp] WarpApp.open() is deprecated. Use openWarpGraph() instead.
   See docs/migrations/v17.0.0.md
   ```
3. Use the logger port if available; fall back to console.warn.
