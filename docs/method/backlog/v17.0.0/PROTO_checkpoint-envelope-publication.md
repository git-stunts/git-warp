---
id: PROTO_checkpoint-envelope-publication
blocked_by:
  - DX_design-0018-flesh-out
  - INFRA_git-trie-store-adapter
  - PROTO_trie-flush
blocks:
  - PROTO_materialize-integration
---

# Publish checkpoint envelope trees and checkpoint commits using native Git reachability

## Problem

The current checkpoint model serializes full ORSet state into a single
`state.cbor` blob. With trie-backed ORSets, checkpoint truth must be
a ref-backed checkpoint commit pointing at an envelope tree that
contains the trie root and metadata. This gives native Git reachability
for all trie pages.

## Fix

Define the checkpoint envelope format:

- Checkpoint commit points at an envelope tree
- Envelope tree contains: trie root OID for nodeAlive, trie root OID
  for edgeAlive, prop/edgeBirthEvent/observedFrontier as a metadata
  blob
- Checkpoint ref (`refs/warp/checkpoint/<graph>`) points at the commit
- All trie pages are reachable from the commit via the envelope tree

Publication flow: flush trie -> build envelope tree -> create commit ->
update ref.

## Scope

**In:** Envelope tree format. Commit creation. Ref update. Backward
compatibility: v5 checkpoints (single state.cbor blob) still readable
via existing deserialization path.

**Out:** No migration of existing checkpoints. Old checkpoints are
cache-only and can be rebuilt.

## Notes

- This is the reachability story. Without this, trie pages are
  unreachable objects that `git gc` will collect.
- Do not serialize checkpoint truth as "trie root OID in CBOR". The
  truth is a ref -> commit -> envelope tree -> trie trees -> leaf blobs.
