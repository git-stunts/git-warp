---
id: SUB_gc-stale-cache-invalidation
blocked_by: []
blocks: []
---

# GC swap does not invalidate derived caches

**Effort:** S

## Problem

Both `_maybeRunGC` and `runGC` swap `_cachedState` with a compacted
clone, but leave `_materializedGraph`, `_logicalIndex`, `_propertyReader`,
and `_cachedIndexTree` pointing at pre-compaction objects. This keeps
the old tombstone-heavy state strongly reachable and can serve stale
adjacency/index data to queries until the next full materialize.

## Fix

After swapping `_cachedState`, invalidate or rebuild:
- `_materializedGraph` (rebuild adjacency from new state)
- `_logicalIndex` / `_propertyReader` (null out, or rebuild via `_buildView`)
- `_cachedIndexTree` / `_cachedViewHash` (null out)

Flagged by CodeRabbit in PR #75. Pre-existing from the original mixin.
