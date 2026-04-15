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
Git tree and blob objects and publishes checkpoint commits via refs.

## Fix

Implement `GitTrieStoreAdapter` in the infrastructure layer. It uses
`@git-stunts/plumbing` (or the existing `TreePort`/`BlobPort`) to:

- Write leaf data as Git blobs (`git hash-object -w --stdin`)
- Write branch nodes as Git trees with entries `0`-`f`
- Read leaf blobs and branch trees by OID
- Create checkpoint commits pointing at the trie root tree
- Update checkpoint refs

## Scope

**In:** Adapter implementation. Integration tests against a real Git
repo. In-memory test double for unit tests.

**Out:** No git-cas routing for core trie objects. The design locks
trie publication to native Git objects.

## Notes

- Branch tree entries are named `0` through `f` (hex nibbles), each
  pointing to a child OID (tree or blob).
- Leaf blobs contain CBOR-encoded entry data.
