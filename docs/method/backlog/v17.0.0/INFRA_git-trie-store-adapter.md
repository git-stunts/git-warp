---
id: INFRA_git-trie-store-adapter
blocked_by:
  - PROTO_git-trie-store-port
blocks:
  - PROTO_checkpoint-envelope-publication
---

# Git-native TrieStorePort adapter

## Problem

`TrieStorePort` captures the branch/leaf storage contract, but the trie
line still needs a real plumbing-backed adapter over Git blobs and
trees.

## Fix

Implement `GitTrieStoreAdapter` against native Git object I/O:

- write/read leaves as Git blobs
- write/read branches as Git trees
- preserve deterministic entry naming and typed adapter errors

## Scope

**In:** adapter implementation, round-trip tests, and deterministic
error mapping.

**Out:** page cache, cursor lifecycle, flush pipeline, and checkpoint
publication.
