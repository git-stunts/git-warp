---
id: PERF_lru-page-cache
blocked_by: []
blocks:
  - PROTO_shadow-trie-orset
---

# Bounded LRU page cache for deserialized leaves and branch metadata

## Problem

Without caching, every trie operation hits the Git object store. The
cursor needs a bounded working-set cache that keeps hot pages resident
without unbounded memory growth.

## Fix

Implement `PageCache` in `warp-orset`:

- Configurable max-residency count (number of pages, not bytes)
- Pages keyed by OID
- LRU eviction policy
- Shared across both `nodeAlive` and `edgeAlive` tries within a session
- `get(oid): TriePage | null`
- `put(oid, page): void`
- `evict(): void`
- `stats(): { hits, misses, evictions, resident }`

## Scope

**In:** Cache implementation. Cache-aware cursor integration point.
Unit tests for eviction behavior.

**Out:** Capacity tuning (that is PERF_trie-geometry-and-memory-profile).

## Notes

- Cache holds deserialized `TriePage` objects, not raw buffers, to
  avoid repeated decode cost.
- Capacity is a constructor parameter. Bounded residency, not zero-heap.
