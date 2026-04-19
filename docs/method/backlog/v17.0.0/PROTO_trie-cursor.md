---
id: PROTO_trie-cursor
blocked_by:
  - PROTO_blake3-route-key
  - PROTO_trie-codec-and-geometry
blocks:
  - PERF_lru-page-cache
  - PROTO_trie-flush
---

# Path-descending trie cursor with dirty tracking

## Problem

The trie line still lacks the navigation layer that descends by
route-key nibbles, mutates leaves, and records deterministic dirty
state for later flush.

## Fix

Implement `TrieCursor` with:

- path descent over trie branches
- read/mutate operations for live/tombstoned dots
- deterministic dirty-page tracking
- split handling when leaves exceed capacity

## Scope

**In:** cursor navigation, dirty tracking, and deterministic traversal
behavior.

**Out:** page cache policy, flush persistence, merge logic, and
checkpoint publication.
