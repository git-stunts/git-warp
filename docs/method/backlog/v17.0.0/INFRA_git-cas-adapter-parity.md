---
id: INFRA_git-cas-adapter-parity
blocks:
  - INFRA_substrate-upgrade-tool
blocked_by: []
feature: runtime-boundaries
---

# Finish git-cas adapter parity for GitGraphAdapter

## Problem

Cycle 0093 moved `GitGraphAdapter.writeBlob()` and
`GitGraphAdapter.writeTree()` onto `@git-stunts/git-cas`, but the rest of
the originally proposed unification was not behaviorally safe.

The current git-cas adapters do not yet expose every graph-persistence
semantic git-warp needs:

- `GitPersistenceAdapter.readBlobStream()` now exists in git-cas v6; git-warp
  should prefer that for graph blob reads instead of collecting first.
- `GitPersistenceAdapter.readBlob()` still has metadata safety limits; git-warp
  must keep an explicit unbounded read posture only where a caller knowingly
  asks to collect a complete graph blob.
- `GitPersistenceAdapter.iterateTree()` and `readTreeEntry()` now exist in
  git-cas v6; git-warp can use them as the substrate for recursive,
  path-preserving tree traversal instead of raw `ls-tree` calls.
- `GitPersistenceAdapter.readTree()` returns one-level parsed tree
  entries, while git-warp's `readTreeOids()` returns a recursive
  path-to-OID map.
- `GitGraphAdapter.readTree()` recursively reads all blob payloads by
  path; git-cas only parses tree entries.
- `GitRefAdapter.createCommit()` models one optional parent and no
  signing flag; git-warp supports multi-parent commits and signed
  commits.
- `GitGraphAdapter.compareAndSwapRef()` must not retry CAS failures and
  uses the zero-OID convention for missing refs.
- `GitGraphAdapter.deleteRef()` has no equivalent git-cas ref method.

## Fix

Finish the adapter convergence only where semantics remain identical.

Acceptable completion shapes:

- extend git-cas with unbounded/blob-stream read support, recursive tree
  traversal, multi-parent/signed commit creation, non-retried CAS, and
  ref deletion; then delegate from `GitGraphAdapter`
- or add a narrow git-warp infrastructure adapter around git-cas that
  preserves the current graph-specific laws while removing redundant raw
  plumbing call sites

Do not replace current read/ref/commit behavior with weaker git-cas
methods just to make the class look thinner.

## Closed shape

The repo-local completion path uses `GitCasGraphReaderAdapter` as the
narrow infrastructure adapter around git-cas v6:

- `GitGraphAdapter.readBlob()` delegates to
  `GitPersistenceAdapter.readBlobStream()` and collects at the
  graph-adapter boundary only.
- `GitGraphAdapter.readTreeOids()` recursively walks
  `GitPersistenceAdapter.iterateTree()` so git-warp keeps its
  path-preserving recursive `Record<path, oid>` contract.
- `GitGraphAdapter.readTree()` resolves blob payloads through the same
  stream-backed read path.
- commit creation, compare-and-swap ref updates, and ref deletion remain
  in `GitGraphAdapter` because git-cas does not expose equivalent
  multi-parent signing, non-retried CAS, or delete-ref semantics.

## Acceptance Criteria

- `GitGraphAdapter.readBlob()` moves to `GitPersistenceAdapter.readBlobStream()`
  plus an explicit collector at the adapter boundary.
- recursive tree OID reads remain recursive and path-preserving.
- one-entry tree reads and tree iteration use git-cas v6 APIs where semantics
  match exactly.
- commit creation continues to support multiple parents and signing.
- ref CAS failures are not retried.
- ref deletion remains available.
- the substrate upgrade tool depends on the parity surface, not on stale
  raw-reader compatibility in `src/`.
