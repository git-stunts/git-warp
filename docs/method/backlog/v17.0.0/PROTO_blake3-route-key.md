---
id: PROTO_blake3-route-key
blocked_by: []
blocks:
  - PROTO_trie-codec-and-geometry
  - PROTO_shadow-trie-orset
---

# Binary blake3(elementId) route-key derivation and routing helpers

## Problem

The Shadow-Trie ORSet needs a deterministic, uniformly distributed key
to route elements into trie paths. Raw element IDs (node IDs, edge keys)
are variable-length strings with non-uniform distribution.

## Fix

Create a `RouteKey` module in `warp-orset` that:

1. Takes a string element ID
2. Computes its blake3 hash (32 bytes)
3. Extracts a sequence of 4-bit nibbles for trie path navigation

Public API: `routeKey(element: string): Uint8Array` and
`nibbleAt(key: Uint8Array, depth: number): number`.

## Scope

**In:** Pure functions, no I/O. Unit tests with property-based
distribution checks. blake3 dependency wiring.

**Out:** No trie structure. No storage. Just the hash-to-nibble-path
derivation.
