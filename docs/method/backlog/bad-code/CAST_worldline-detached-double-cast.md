---
id: CAST_worldline-detached-double-cast
blocked_by: []
blocks: []
---

# Worldline double-casts itself to WarpRuntime in 3 places

**Effort:** S

## What's Wrong

Worldline constructor, `query()`, and `observer()` all cast `this`
through `/** @type {unknown} */` to pretend Worldline is a WarpRuntime.
This is Rule 0 lying -- Worldline is NOT a WarpRuntime. The cast chain
(`this` -> `unknown` -> `WarpRuntime`) exists solely to silence tsc
without establishing any runtime truth.

## Suggested Fix

Define a `GraphQueryHost` interface/port with the methods
LogicalTraversal and QueryBuilder actually need. Both WarpRuntime and
Worldline implement it honestly. No more lying casts, and the
dependency direction is correct (domain depends on port, not on
concrete runtime).
