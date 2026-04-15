---
id: PROTO_trie-flush
blocked_by:
  - PROTO_trie-cursor
blocks:
  - PROTO_shadow-trie-orset
  - PROTO_checkpoint-envelope-publication
---

# Flush dirty leaves/blobs and branch trees to Git deterministically

## Problem

After mutations, the cursor holds a set of dirty pages that must be
persisted. Modified leaves become new Git blobs, modified branches
become new Git trees, and a new root OID is produced.

## Fix

Implement `TrieFlusher` in `warp-orset`:

1. Walk the dirty-page set bottom-up (leaves first, then branches)
2. Serialize each modified leaf to a Git blob via `TrieStorePort`
3. Serialize each modified branch to a Git tree (entries `0`-`f`)
4. Return the new root tree OID
5. Unmodified subtrees retain their original OIDs (structural sharing)

## Scope

**In:** Flush implementation. Deterministic bottom-up traversal.
Integration tests verifying round-trip through store.

**Out:** Checkpoint commit creation (that is
PROTO_checkpoint-envelope-publication). The flusher produces a root
OID; the checkpoint publisher wraps it in a commit.
