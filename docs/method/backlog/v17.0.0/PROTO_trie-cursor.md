---
id: PROTO_trie-cursor
blocked_by:
  - PROTO_trie-codec-and-geometry
  - INFRA_git-trie-store-adapter
blocks:
  - PERF_lru-page-cache
  - PROTO_trie-flush
---

# Path-descending trie cursor for reads, updates, and structural sharing

## Problem

The trie needs a navigation layer that descends through branches by
following nibble paths, resolves to leaves, and supports mutations
with dirty tracking for later flush.

## Fix

Implement `TrieCursor` in `warp-orset`:

- `contains(element): Promise<boolean>` — descend to leaf, check
- `add(element, dot): Promise<void>` — descend, mutate leaf, mark dirty
- `remove(observedDots): Promise<void>` — descend, tombstone, mark dirty
- `getDots(element): Promise<Set<string>>` — descend, return live dots
- Tracks a dirty-page set (modified leaves and branches)
- Loads pages via injected `TrieStorePort` (async)
- Structural sharing: unmodified subtrees keep their OIDs

## Scope

**In:** Cursor implementation. Dirty tracking. Async page loading.
Unit tests against in-memory store double.

**Out:** No caching (that is PERF_lru-page-cache). No flush (that is
PROTO_trie-flush). The cursor tracks what is dirty but does not
persist it.
