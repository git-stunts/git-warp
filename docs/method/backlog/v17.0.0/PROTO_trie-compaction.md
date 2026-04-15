---
id: PROTO_trie-compaction
blocked_by:
  - PROTO_shadow-trie-orset
blocks:
  - PROTO_state-session-async
---

# Trie-aware compaction, undersized-leaf merge, and dot compaction policy

## Problem

GC needs to compact tombstoned dots from the trie. After compaction,
some leaves may become undersized and should merge back into their
parent. The in-memory ORSet's `compact(vv)` does this in one pass
over `entries` + `tombstones`; the trie version must walk leaves.

## Fix

Implement trie-aware `compact(includedVV)` on `ShadowTrieORSet`:

1. Walk all leaves in the trie
2. For each leaf, remove tombstoned dots within the stable frontier
3. Remove elements with no remaining live dots
4. If a leaf drops below the merge floor, merge it into its parent
   branch's sibling leaf (or collapse the branch)
5. Mark modified pages dirty for flush

## Scope

**In:** Compaction logic. Undersized-leaf merge. Dirty tracking.
Unit tests verifying dot removal and structural merges.

**Out:** GC lifecycle integration (PROTO_gc-state-session). The
compaction method is called by GC through the StateSession.
