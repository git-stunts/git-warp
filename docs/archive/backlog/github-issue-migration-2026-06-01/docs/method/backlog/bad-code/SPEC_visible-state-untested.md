---
id: SPEC_visible-state-untested
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# VisibleStateComparisonV5 (808 LOC) and VisibleStateTransferPlannerV5 (692 LOC) have zero tests

**Effort:** M

## Issue

Two modules (1500 LOC combined) that compute state diffs and transfer
plans have zero dedicated tests. They also duplicate helper functions
(`compareStrings`, `valueKey`, `edgeKey`) between them. Critical for
sync protocol correctness.

## Fix

Create dedicated tests. Extract shared helpers to a common module.
These are pure-function modules — easy to unit test.
