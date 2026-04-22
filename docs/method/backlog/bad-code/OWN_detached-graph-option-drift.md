---
id: OWN_detached-graph-option-drift
blocked_by: []
blocks: []
---

# Detached graph openers duplicate and drift from WarpRuntime.open()

**Effort:** M

## What's Wrong

`openDetachedReadGraph()` in MaterializeController and
`openDetachedObserverGraph()` in QueryController manually rebuild the
options bag from `host._*` fields. When `WarpRuntime.open()` gets a
new option (like `indexStore`), these functions must be updated
manually. We forgot `indexStore` in the first pass.
`Worldline.buildDetachedOpenOptions()` has the same problem with 13+
private fields.

## Suggested Fix

Extract a single `getDetachedOpenOptions()` method on WarpRuntime that
returns the options bag. All three call sites delegate to it. New
options are added once, in one place.
