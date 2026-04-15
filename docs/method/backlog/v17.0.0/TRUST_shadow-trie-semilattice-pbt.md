---
id: TRUST_shadow-trie-semilattice-pbt
blocked_by:
  - PROTO_shadow-trie-orset
blocks:
  - PERF_trie-geometry-and-memory-profile
---

# Property-based tests for semilattice laws, structural sharing, and merge invariants

## Problem

The ShadowTrieORSet must preserve the same CRDT semantics as the
in-memory ORSet: commutativity, associativity, and idempotency of
`join`; add-wins semantics; compact safety. A bug here means data
loss or divergence across writers.

## Fix

Port existing ORSet property-based tests to run against both in-memory
`ORSet` and `ShadowTrieORSet`. Use `fast-check` arbitraries to generate
random element IDs, dots, and operation sequences. Verify bit-identical
results between the two implementations.

Test properties:
- `join(a, b) == join(b, a)` (commutativity)
- `join(join(a, b), c) == join(a, join(b, c))` (associativity)
- `join(a, a) == a` (idempotency)
- concurrent add + remove -> add wins
- `compact` does not change visible elements
- structural sharing: unmodified subtrees share OIDs

## Scope

**In:** Property-based test suite. Dual-implementation comparison.
Structural sharing verification.

**Out:** Performance benchmarking (PERF_trie-geometry-and-memory-profile).
