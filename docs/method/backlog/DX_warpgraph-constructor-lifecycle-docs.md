# WarpGraph Constructor Lifecycle Docs

**Effort:** M

## Problem

Document cache invalidation strategy for 25 instance variables: which operations dirty which caches, which flush them.

## Notes

- File: `src/domain/WarpGraph.js:69-198`
- Depends on B143 RFC (exists at `docs/design/warpgraph-decomposition.md`)
- Low urgency — fold into PRs that touch related files
