---
id: PROTO_checkpoint-envelope-publication
blocked_by:
  - INFRA_git-trie-store-adapter
  - PROTO_trie-flush
blocks:
  - PROTO_materialize-integration
---

# Publish checkpoint envelope trees and checkpoint commits using native Git reachability

## Problem

The current checkpoint model serializes full ORSet state into a single
`state.cbor` blob. With trie-backed ORSets, checkpoint truth must be
a ref-backed checkpoint commit pointing at an envelope tree whose
entries are real Git tree entries — not OIDs mentioned inside blobs.
Git follows tree entries, not OIDs embedded in CBOR.

## Fix

Define the checkpoint envelope as a Git tree with real entries:

```
refs/warp/checkpoint/<graph>
  → checkpoint commit
    → envelope tree
      ├── state/
      │   ├── nodeAlive/   → trie root tree (Git tree OID)
      │   └── edgeAlive/   → trie root tree (Git tree OID)
      ├── descriptor.cbor  → graph identity, version, writer metadata
      ├── frontier.cbor    → observedFrontier, edgeBirthEvent
      └── appliedVV.cbor   → applied version vector (GC boundary)
```

The trie root entries are real tree entries pointing at the actual
trie root trees. Git follows tree → tree → blob natively. All trie
pages are reachable from the checkpoint commit through normal Git
tree traversal.

`prop`, `edgeBirthEvent`, and `observedFrontier` are serialized into
small CBOR blobs as direct tree entries. They stay in kernel space —
they are not trie-backed in the first cut.

Publication flow: flush tries → build envelope tree → create commit →
update ref.

## Scope

**In:** Envelope tree format with real tree entries. Commit creation.
Ref update. Hard version boundary in shipped runtime: checkpoint
publication and runtime reads support only the envelope-tree substrate.
Legacy v5 checkpoints are upgraded offline by
`scripts/migrations/v17.0.0/migrate.ts`, not by a shipped fallback
reader in `src/`.

**Out:** No runtime fallback for legacy checkpoints. No dual-path
materialize logic in shipped code. Legacy checkpoint import lives in the
versioned migration tool.

## Notes

- This is the reachability story. Without real tree entries, trie pages
  are unreachable objects that `git gc` will collect.
- Do NOT degrade into "roots in CBOR." That reintroduces the exact
  reachability bug this design exists to kill. The envelope must have
  `state/nodeAlive/` and `state/edgeAlive/` as real Git tree entries
  pointing at the trie root trees.
- This item lives in kernel/adapters land, not in warp-orset. The
  TrieStorePort stays boring (read/write leaves and branches). The
  checkpoint publication logic uses the flushed trie root OIDs to
  build the envelope tree.
- Old-format checkpoint readers belong in
  `scripts/migrations/v17.0.0/legacy/` (or equivalent migration-tool
  internals), not in the main shipping runtime.
