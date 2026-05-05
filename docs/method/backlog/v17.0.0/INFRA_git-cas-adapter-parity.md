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

- `GitPersistenceAdapter.readBlob()` collects without git-warp's
  explicit `maxBytes: Number.POSITIVE_INFINITY` read posture.
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

## Acceptance Criteria

- `GitGraphAdapter.readBlob()` keeps an explicit unbounded read or moves
  to an equivalent streaming git-cas API.
- recursive tree OID reads remain recursive and path-preserving.
- commit creation continues to support multiple parents and signing.
- ref CAS failures are not retried.
- ref deletion remains available.
- the substrate upgrade tool depends on the parity surface, not on stale
  raw-reader compatibility in `src/`.
