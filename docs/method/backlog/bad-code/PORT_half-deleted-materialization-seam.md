---
id: PORT_half-deleted-materialization-seam
blocked_by: []
blocks: []
feature: api-capabilities
release_home: v17.0.0
---

# `_materializeGraph()` survives the v17 reading contract

**Effort:** L

## What's Wrong

v17 is supposed to expose Optics and Readings over causal worldlines,
not a graph-materialization API. The public `WarpGraph` type no longer
lists `materialize`, but the internal runtime still has
`RuntimeHost._materializeGraph()` and controllers still depend on it.

Observed during the 2026-05-04 audit:

- `src/domain/RuntimeHost.ts` defines `_materializeGraph()`
- `QueryController` depends on `_materializeGraph()`
- `SyncController` calls `_host._materializeGraph()`
- patch, checkpoint, and subscription controller host types still name
  `_materializeGraph`

This is a port/capability honesty problem: the internal port surface is
still speaking materialization while the public API claims the model is
readings.

## Suggested Fix

Replace controller dependencies on `_materializeGraph()` with a named
reading-basis port or service. Add tests that install a throwing
`_materializeGraph` trap and prove blessed read/query/sync/subscription
paths do not call it. Delete `_materializeGraph()` rather than renaming
it to another whole-graph replay helper.
