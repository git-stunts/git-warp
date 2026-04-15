---
id: PROTO_git-trie-store-port
blocked_by:
  - DX_design-0018-flesh-out
blocks:
  - INFRA_git-trie-store-adapter
  - PROTO_state-session-async
  - PROTO_checkpoint-envelope-publication
---

# Git-native trie storage port for branch trees, leaf blobs, and checkpoint envelope publication

## Problem

The Shadow-Trie ORSet stores its structure as native Git objects:
branch nodes are Git trees, leaf nodes are Git blobs. There is no
existing port that captures this specific storage contract. The
trie cursor, flush, and checkpoint publication all need a common
storage abstraction.

## Fix

Define a `TrieStorePort` in the domain layer that provides:

- `readLeaf(oid: string): Promise<Uint8Array>` — read a leaf blob
- `readBranch(oid: string): Promise<Map<number, string>>` — read a
  branch tree (16 nibble entries -> child OIDs)
- `writeLeaf(data: Uint8Array): Promise<string>` — write a leaf blob,
  return OID
- `writeBranch(children: Map<number, string>): Promise<string>` — write
  a branch tree, return OID
- `publishCheckpoint(rootOid: string, metadata: CheckpointMeta): Promise<string>` —
  create checkpoint commit + update ref

## Scope

**In:** Port definition only. No implementation (that is
INFRA_git-trie-store-adapter).

**Out:** This is not a git-cas port. Core trie publication uses raw
Git objects and refs for native reachability.

## Notes

- Branch nodes as Git trees gives us native `git gc` reachability for
  free. No custom ref pinning needed.
- The port must be thin enough that an in-memory test double is trivial
  to build.
