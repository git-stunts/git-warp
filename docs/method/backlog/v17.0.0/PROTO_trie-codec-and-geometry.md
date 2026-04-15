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
convention for branch tree entries. Geometry parameters (leaf capacity,
split threshold, merge floor) must be defined but not hardcoded.

## Fix

1. Define the CBOR schema for leaf blobs: array of `(element, dots[],
   tombstonedDots[])` tuples, sorted by route key for binary search.
2. Define branch tree entry naming: entries `0` through `f` (hex
   nibbles), each pointing to a child OID (tree for branch, blob for
   leaf).
3. Create `TrieLeaf` and `TrieBranch` value objects with split/merge
   predicates. Thresholds are constructor parameters, not constants.

## Scope

**In:** Codec implementation. Value objects with parameterized geometry.
Round-trip tests. Sorted-entry binary search within leaves.

**Out:** No cursor navigation. No storage I/O. Just the data shapes
and their serialization.

## Notes

- Geometry is benchmarked, not declared. The defaults chosen here are
  initial guesses that PERF_trie-geometry-and-memory-profile will
  validate or revise.
- 4-bit nibble branching (16-way) is the starting point.
