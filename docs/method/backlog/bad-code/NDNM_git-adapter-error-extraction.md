# GitGraphAdapter has ~280 LOC of extractable error classification

**Effort:** M

## What's Wrong

`GitGraphAdapter.js` is 1036 LOC. Approximately 280 lines of module-level error classification functions, pattern matching against stderr output, and exit code handling are mixed directly into the persistence adapter file. These are independent concerns — the adapter should delegate to a classifier, not own the classification strategy.

## Suggested Fix

Extract error classification, pattern matching, and exit code handling to a dedicated `gitErrorClassification.js` module. The adapter imports and calls the classifier. This reduces `GitGraphAdapter` by ~25% and makes the classification logic independently testable.
