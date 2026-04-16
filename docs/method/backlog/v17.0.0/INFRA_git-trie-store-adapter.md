---
id: INFRA_git-trie-store-adapter
blocked_by:
  - PROTO_git-trie-store-port
blocks:
  - PROTO_trie-cursor
  - PROTO_checkpoint-envelope-publication
---

# Implement Git-native trie store adapter over raw Git objects and refs

## Problem

The `TrieStorePort` needs a concrete implementation that reads/writes
Git tree and blob objects.

## Fix

Implement `GitTrieStoreAdapter` in the infrastructure layer. It uses
`@git-stunts/plumbing` (or the existing `TreePort`/`BlobPort`) to:

- Write leaf data as Git blobs (`git hash-object -w --stdin`)
- Write branch nodes as Git trees with nibble-named entries
- Read leaf blobs and branch trees by OID

## Scope

**In:** Adapter implementation. Integration tests against a real Git
repo. In-memory test double for unit tests.

**Out:** Checkpoint envelope publication is not part of this adapter.
That belongs in kernel/adapters land
(PROTO_checkpoint-envelope-publication). No git-cas routing for core
trie objects.

## Notes

- Branch tree entries are named by nibble (e.g. `0` through `f` for
  16-way), each pointing to a child OID (tree or blob). The naming
  convention must match the geometry chosen by
  PROTO_trie-codec-and-geometry.
- Leaf blobs contain CBOR-encoded entry data.
