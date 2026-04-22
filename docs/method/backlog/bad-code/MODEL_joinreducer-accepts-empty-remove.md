---
id: MODEL_joinreducer-accepts-empty-remove
blocked_by: []
blocks: []
---

# JoinReducer accepts NodeRemove/EdgeRemove with empty observedDots and no node/edge fields

**Effort:** S

## Issue

`JoinReducer.validation.test.js` explicitly tests and blesses that
`NodeRemove` without a `node` field and with `observedDots: []` is
accepted. The test calls this "informational only." A remove with
zero dots is ALWAYS a no-op — it can never have any effect on the
OR-Set. The validation should at minimum require `observedDots` to
be non-empty, or log a warning for empty removes.

## Fix

Add validation in `nodeRemoveStrategy.validate()` that warns or
rejects when `observedDots` is empty. The `node` field on
`NodeRemove` IS informational in OR-Set semantics, but empty
`observedDots` is never correct for a remove that should have effect.
