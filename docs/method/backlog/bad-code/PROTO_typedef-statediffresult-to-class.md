# Promote StateDiffResult from @typedef to class

**Effort:** S

## Problem

`src/domain/services/StateDiff.js` defines `StateDiffResult` as a
`@typedef {Object}`. Computed diffs pushed to subscribers via
`graph.subscribe()`. Should be a class.
