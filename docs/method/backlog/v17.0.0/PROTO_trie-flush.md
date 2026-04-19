---
id: PROTO_trie-flush
blocked_by:
  - PROTO_trie-codec-and-geometry
  - PROTO_trie-cursor
blocks:
  - PROTO_checkpoint-envelope-publication
  - PROTO_shadow-trie-orset
---

# Bottom-up flush of dirty trie pages

## Problem

After trie mutations, the cursor can describe dirty state but cannot
persist it. Without a flush stage, no new root OID or structurally
shared persisted trie can exist.

## Fix

Implement a bottom-up `TrieFlusher` that:

- consumes the cursor's dirty-page set
- writes leaves then branches in deterministic order
- preserves structural sharing for untouched child OIDs
- returns the new root OID and write counts

## Scope

**In:** deterministic flush ordering, write accounting, and typed flush
errors.

**Out:** commit creation, ref updates, and checkpoint commit
publication.
