---
id: PORT_warpgraph-runtime-exposed
blocked_by: []
blocks: []
feature: api-capabilities
---

# `_runtime` exposed on public WarpGraph interface

**Effort:** S

## What's Wrong

`WarpGraph.ts:119` — the `_runtime` property is accessible on the
public `WarpGraph` object returned by `openWarpGraph()`. This creates
an implicit public API surface that consumers may depend on. Any
refactoring of WarpRuntime internals risks breaking consumers who
reach through `_runtime`.

## Suggested Fix

Make `_runtime` a private field or use a `WeakMap` to associate the
runtime with the graph instance. The capability bag should be the
only surface consumers interact with.
