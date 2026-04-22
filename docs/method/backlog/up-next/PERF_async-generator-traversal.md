---
id: PERF_async-generator-traversal
feature: materialization-query-index
blocked_by:
  - PERF_stream-read-migration
blocks: []
---

# Async Generator Traversal API

**Effort:** L

## Problem

Streaming variants of the remaining GraphTraversal algorithms (`bfsStream()`, `dfsStream()`, etc.) returning `AsyncGenerator` instead of collected arrays. Array-returning methods become sugar over `collect()`.

## Notes

- Prerequisite B151 (transitiveClosure streaming) is complete
- Part of P4 Large-Graph Performance tier
