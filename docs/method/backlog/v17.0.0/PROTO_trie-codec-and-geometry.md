---
id: PROTO_trie-codec-and-geometry
blocked_by: []
blocks:
  - PROTO_trie-cursor
  - PROTO_trie-flush
---

# Trie codec and geometry

## Problem

The trie line needs real runtime-backed geometry and value objects
before cursor, flush, or shadow-orset work can be honest. Fanout,
leaf capacity, branch entries, and leaf serialization cannot stay
implicit.

## Fix

Ship the trie primitives:

- `TrieGeometry`
- `TrieLeaf`
- `TrieBranch`

All must be runtime-backed, versioned, codec-aware, and parameterized
by explicit geometry rather than fanout folklore.

## Scope

**In:** geometry validation, leaf/branch runtime forms, CBOR
serialization, and unit tests.

**Out:** cursor navigation, storage I/O, flush, and ORSet wiring.
