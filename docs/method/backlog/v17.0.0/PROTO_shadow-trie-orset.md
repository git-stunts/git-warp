---
id: PROTO_shadow-trie-orset
blocked_by:
  - PROTO_orsetlike-contract
  - PROTO_blake3-route-key
  - PERF_lru-page-cache
  - PROTO_trie-flush
blocks:
  - PROTO_trie-compaction
  - TRUST_shadow-trie-semilattice-pbt
  - PROTO_state-session-async
---

# Implement ShadowTrieORSet behind ORSetLike using route keys, cursor, cache, and flush

## Problem

The in-memory ORSet stores all entries and tombstones in V8 heap as
`Map<string, Set<string>>`. This does not scale to graphs that exceed
available memory. The ORSetLike seam exists; now we need a concrete
implementation backed by the trie.

## Fix

Implement `ShadowTrieORSet` in `warp-orset`:

- Implements the `ORSetLike` contract
- Delegates to `TrieCursor` + `PageCache` internally
- Routes elements to trie paths via `routeKey(element)`
- `add(element, dot)`: descend to leaf, insert, mark dirty
- `remove(observedDots)`: descend, tombstone, mark dirty
- `contains(element)`: descend to leaf, check
- `getDots(element)`: descend, return live dots
- `elements()`: full trie scan collecting all visible elements
- `compact(vv)`: delegates to PROTO_trie-compaction

## Scope

**In:** ShadowTrieORSet class. Full ORSetLike contract satisfaction.
Integration tests against in-memory store double.

**Out:** Async session lifecycle (PROTO_state-session-async). Compaction
logic (PROTO_trie-compaction). Semilattice proofs
(TRUST_shadow-trie-semilattice-pbt).

## Notes

- First cut only needs to satisfy nodeAlive and edgeAlive.
- LWW stays out of this package.
- `elements()` does a full scan. Acceptable for first cut since it is
  only called by index builder and GC, not hot paths.
