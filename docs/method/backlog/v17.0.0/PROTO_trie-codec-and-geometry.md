---
id: PROTO_trie-codec-and-geometry
blocked_by:
  - PROTO_blake3-route-key
blocks:
  - PROTO_trie-cursor
  - PROTO_shadow-trie-orset
  - PERF_trie-geometry-and-memory-profile
---

# Leaf blob encoding, branch tree entry naming, and geometry parameters

## Problem

The trie needs a concrete binary format for leaf blobs and a naming
convention for branch tree entries. Geometry parameters (fanout, leaf
capacity, split threshold, merge floor) must be defined but not
hardcoded. The port, codec, and cursor must all be
geometry-parameterized from day one, not frozen to 16-way and
"benchmarked later."

## Fix

1. Define the CBOR schema for leaf blobs. Each entry is a
   `(routeKeySuffix, element, dots[], tombstonedDots[])` tuple.
   Entries are sorted by route-key suffix for binary search within
   the leaf. The route-key suffix is the portion of the route key
   below the leaf's trie depth — it avoids redundantly storing the
   prefix that the trie path already encodes.
2. Define branch tree entry naming as a function of fanout: for
   fanout F, entries are named `0` through `(F-1).toString(16)`.
   v1 starts with F=16 (4-bit nibbles), but the naming and codec
   must work for any power-of-two fanout.
3. Create `TrieLeaf` and `TrieBranch` value objects parameterized by
   a `TrieGeometry` configuration object:
   - `fanout: number` — branching factor (16, 64, 256)
   - `nibbleBits: number` — bits per nibble (4, 6, 8)
   - `leafCapacity: number` — split threshold
   - `leafFloor: number` — merge floor
4. All geometry values are constructor parameters on `TrieGeometry`.
   v1 defaults are initial guesses validated by
   PERF_trie-geometry-and-memory-profile.

## Scope

**In:** Codec implementation. `TrieGeometry` config object.
`TrieLeaf` and `TrieBranch` value objects with parameterized
split/merge predicates. Round-trip tests. Sorted-entry binary search
within leaves.

**Out:** No cursor navigation. No storage I/O. Just the data shapes,
their serialization, and the geometry configuration.

## Notes

- v1 defaults to 16-way (4-bit nibbles). This is explicitly an
  initial guess, not a locked constant. The port, codec, and cursor
  all accept `TrieGeometry` so the benchmark can vary fanout without
  code changes.
- Leaf entries use route-key suffixes, not raw element IDs or full
  route keys. This is the tighter shape settled on in design review.
