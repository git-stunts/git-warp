---
id: OWN_logical-traversal-facade
blocked_by: []
blocks: []
feature: merge-strands-worldlines
release_home: v20.0.0+
---

# LogicalTraversal.js (590 LOC) is a deprecated facade with zero tests

**Effort:** S

## Issue

LogicalTraversal is marked as deprecated (delegates to GraphTraversal)
but is still 590 LOC with zero dedicated tests. It's imported by
WarpRuntime and Worldline. If it's truly just a facade, it should be
thin. If it has real logic, it needs tests.

## Fix

Verify it's purely delegation. If so, shrink to <100 LOC. If it has
logic, add tests. Consider removing the facade entirely and having
callers use GraphTraversal directly.
