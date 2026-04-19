---
id: PROTO_blake3-route-key
blocked_by: []
blocks:
  - PROTO_shadow-trie-orset
  - PROTO_trie-cursor
---

# Binary blake3 route-key derivation

## Problem

The shadow trie needs a deterministic, uniformly distributed routing key
for element IDs. Raw element strings are not the right navigation shape
for trie descent.

## Fix

Create a pure route-key module that:

- hashes element IDs with blake3
- exposes the binary route key
- exposes nibble extraction helpers for depth-wise trie descent

## Scope

**In:** pure functions, routing helpers, and unit/property tests.

**Out:** trie structure, storage, and cursor lifecycle.
