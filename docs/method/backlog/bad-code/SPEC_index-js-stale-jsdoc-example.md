# index.js JSDoc example uses deprecated WarpApp API

**Effort:** S

## What's Wrong

`index.js:14-32` — the module-level JSDoc `@example` block shows
`WarpApp.open()`, `app.createPatch()`, and `app.materialize()`.
These are the v16 API patterns. The v17 entry point is
`openWarpGraph()` with the capability bag pattern.

This text renders in IDE hover tooltips and on jsr.io, so it's the
first thing many consumers see.

## Suggested Fix

Rewrite the `@example` to use `openWarpGraph()` and the capability
bag namespace pattern:
```js
const graph = await openWarpGraph({ persistence, graphName, writerId });
const patch = await graph.patches.createPatch();
// ...
```
