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

# Implement ShadowTrieORSet as async storage-backed ORSet engine

## Problem

The in-memory ORSet stores all entries and tombstones in V8 heap as
`Map<string, Set<string>>`. This does not scale to graphs that exceed
available memory. We need an async, storage-backed engine that delegates
to the trie cursor, cache, and flusher.

## Fix

Implement `ShadowTrieORSet` in `warp-orset`:

- Does NOT implement `ORSetLike` (which is the synchronous in-memory
  seam). Instead, `ShadowTrieORSet` has its own async interface.
- Delegates to `TrieCursor` + `PageCache` internally
- Routes elements to trie paths via `routeKey(element)`
- `add(element, dot): Promise<void>` — descend to leaf, insert, dirty
- `remove(observedDots): Promise<void>` — descend, tombstone, dirty
- `contains(element): Promise<boolean>` — descend to leaf, check
- `getDots(element): Promise<Set<string>>` — descend, return live dots
- `scan(): AsyncIterable<VisibleElement>` — async iteration over all
  visible elements (replaces synchronous `elements()`)
- `compact(vv): Promise<void>` — delegates to PROTO_trie-compaction

`StateSession` (PROTO_state-session-async) wraps this engine and
presents it to domain code as the domain-facing contract.

## Scope

**In:** ShadowTrieORSet class with async interface. Integration tests
against in-memory store double.

**Out:** Session lifecycle (PROTO_state-session-async). Compaction
(PROTO_trie-compaction). Semilattice proofs
(TRUST_shadow-trie-semilattice-pbt).

## Notes

- First cut only needs to satisfy nodeAlive and edgeAlive.
- LWW stays out of this package.
- `scan()` is an async iterable, not a synchronous `elements()` call.
  This is the honest shape of out-of-core state access.
