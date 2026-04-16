---
id: PROTO_git-trie-store-port
blocked_by: []
blocks:
  - INFRA_git-trie-store-adapter
  - PROTO_state-session-async
---

# Git-native trie storage port for branch trees and leaf blobs

## Problem

The Shadow-Trie ORSet stores its structure as native Git objects:
branch nodes are Git trees, leaf nodes are Git blobs. There is no
existing port that captures this specific storage contract.

## Fix

Define a `TrieStorePort` in the domain layer that provides:

- `readLeaf(oid: string): Promise<Uint8Array>` — read a leaf blob
- `readBranch(oid: string): Promise<BranchEntries>` — read a branch
  tree (nibble entries -> child OIDs)
- `writeLeaf(data: Uint8Array): Promise<string>` — write a leaf blob,
  return OID
- `writeBranch(children: BranchEntries): Promise<string>` — write a
  branch tree, return OID

The branch entry type is geometry-parameterized (see Notes). The port
does not assume a fixed fanout.

## Scope

**In:** Port definition only. No implementation (that is
INFRA_git-trie-store-adapter).

**Out:** Checkpoint envelope publication belongs in kernel/adapters
land (PROTO_checkpoint-envelope-publication), not in the ORSet storage
port. The trie store is boring: read/write leaves and branches. That
is all.

## Notes

- Branch nodes as Git trees gives us native `git gc` reachability for
  free. No custom ref pinning needed.
- The port must be thin enough that an in-memory test double is trivial
  to build.
- The branch entry type must be geometry-parameterized. v1 starts with
  16-way (4-bit nibbles, entries `0`-`f`), but the port shape must not
  hardcode 16. Use a `Map<number, string>` or equivalent that works
  for any fanout the geometry benchmark settles on.
