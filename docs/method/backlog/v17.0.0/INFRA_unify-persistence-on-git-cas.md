---
id: INFRA_unify-persistence-on-git-cas
blocks: []
blocked_by: []
---

# Unify all persistence on @git-stunts/git-cas

## Problem

`GitGraphAdapter` (900+ LOC) reimplements the same Git plumbing that
git-cas already abstracts: `writeBlob`, `writeTree`, `readBlob`,
`readTree`, `createCommit`, `updateRef`. Both talk to
`@git-stunts/plumbing` underneath.

This means:
- No streaming for large graphs (git-cas has streaming, GitGraphAdapter buffers)
- No dedup (git-cas has CDC chunking + content-addressed dedup)
- Two parallel implementations of the same operations
- Divergent error handling and retry logic

## Fix

`GitGraphAdapter` should delegate to git-cas's `GitPersistenceAdapter`
+ `GitRefAdapter` instead of calling plumbing directly. The port
contracts (`BlobPort`, `TreePort`, `CommitPort`, `RefPort`) stay the
same — only the adapter implementation changes.

### Migration path

1. TrustChainPort adapter uses git-cas directly (sets the pattern)
2. New adapters default to git-cas
3. Gradually migrate GitGraphAdapter methods to delegate to git-cas
4. Eventually GitGraphAdapter becomes a thin wrapper

## Why git-cas

- Streaming API — can't assume the graph fits in memory
- Strong dedup via CDC chunking
- Uniform access pattern across the codebase
- Already used by CasBlobAdapter and CasSeekCacheAdapter

## Carve-out: core trie publication is native Git

The Shadow-Trie ORSet (Design 0018) stores its trie state as native
Git trees and blobs for `git gc` reachability. Checkpoint envelopes
are published as Git commits with real tree entries pointing at trie
roots. This is explicitly **out of scope** for the git-cas unification.

Core trie publication must NOT be routed through git-cas. The
reachability model depends on native Git tree traversal, which git-cas
tree OIDs would break. See `docs/design/0034-unify-seek-cache-and-checkpoints.md`
and `PROTO_git-trie-store-port` for the native-Git publication path.
