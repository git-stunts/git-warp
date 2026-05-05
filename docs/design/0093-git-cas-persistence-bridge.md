# 0093 Git-CAS Persistence Bridge

- Status: write-side bridge shipped; broad adapter card resplit
- Pulled item: `INFRA_unify-persistence-on-git-cas`
- Successor item: `INFRA_git-cas-adapter-parity`
- Release lane: `v17.0.0`

## Hill

Move the parts of `GitGraphAdapter` that are already behaviorally
equivalent onto `@git-stunts/git-cas`, without weakening git-warp's
graph semantics or streaming posture.

The original backlog item asked for `GitGraphAdapter` to delegate
`writeBlob`, `writeTree`, `readBlob`, `readTree`, `createCommit`, and
`updateRef` to `GitPersistenceAdapter` and `GitRefAdapter`. That was too
broad. The adapter names overlap, but the contracts are not all
equivalent.

## Graft Alignment

Graft is a downstream app and motivating use case, not the backlog
planner. It is a context governor over repositories, structural
worldlines, and causal activity. The relevant question for git-warp is
whether the storage and graph substrate can eventually answer
Graft-shaped structural questions without full materialization.

This cycle is substrate hygiene toward that goal. It does not implement
Graft queries. It removes one redundant write-side plumbing path while
leaving non-equivalent read, ref, and commit behavior explicit.

## What Is Equivalent Today

`GitGraphAdapter.writeBlob()` and `GitGraphAdapter.writeTree()` used the
same Git plumbing commands that `GitPersistenceAdapter` already owns:

| `GitGraphAdapter` method | git-cas surface | Decision |
|--------------------------|-----------------|----------|
| `writeBlob(content)` | `GitPersistenceAdapter.writeBlob(content)` | Delegate |
| `writeTree(entries)` | `GitPersistenceAdapter.writeTree(entries)` | Delegate |

The adapter still trims returned OIDs at the git-warp boundary,
normalizes `Uint8Array` blob content to `Buffer` before crossing into
git-cas, and supplies git-warp's existing retry options through a
git-cas policy-shaped bridge.

## What Is Not Equivalent Yet

The following surfaces stay local in `GitGraphAdapter` until git-cas
offers matching semantics or git-warp adds a narrow compatibility
adapter that preserves them.

| `GitGraphAdapter` surface | git-cas surface | Gap |
|---------------------------|-----------------|-----|
| `readBlob(oid)` | `GitPersistenceAdapter.readBlob(oid)` | git-warp uses `collect({ asString: false, maxBytes: Number.POSITIVE_INFINITY })` and disambiguates empty blobs from missing objects. Current git-cas blob reads collect without the explicit unbounded cap. |
| `readTreeOids(treeOid)` | `GitPersistenceAdapter.readTree(treeOid)` | git-warp returns a recursive path-to-OID map via `ls-tree -r -z`; git-cas returns one-level parsed tree entries. |
| `readTree(treeOid)` | `GitPersistenceAdapter.readTree(treeOid)` plus blob reads | git-warp recursively reads all blob payloads by path; git-cas only parses the tree entries. |
| `_createCommit(opts)` | `GitRefAdapter.createCommit(opts)` | git-warp supports multiple parents and signed commits; git-cas currently exposes one optional parent and no signing flag. |
| `compareAndSwapRef(ref, newOid, expectedOid)` | `GitRefAdapter.updateRef(opts)` | git-warp CAS failures must not retry and use the zero-OID convention for missing refs. |
| `deleteRef(ref)` | no equivalent | git-warp needs explicit ref deletion. |

## Technical Decision

`GitGraphAdapter` now owns a `GitPersistenceAdapter` instance for safe
object writes only:

- `writeBlob()` delegates to `GitPersistenceAdapter.writeBlob()`.
- `writeTree()` delegates to `GitPersistenceAdapter.writeTree()`.
- delegated writes still use `GitGraphAdapter` retry options through a
  small policy adapter.
- `readBlob()` keeps the unbounded collect and empty-object existence
  check.
- recursive tree reads remain local.
- multi-parent and signed commit creation remain local.
- ref CAS and ref deletion remain local.

This is deliberately not a "thin wrapper" yet. A thin wrapper is only
honest after the underlying git-cas ports can express the same behavior
without hidden graph-regression cost.

## Successor Work

`INFRA_unify-persistence-on-git-cas` is closed as a broad premise and
replaced by `INFRA_git-cas-adapter-parity`.

The successor must either:

- extend git-cas with unbounded/blob-stream read support and recursive
  tree traversal semantics, or
- introduce a git-warp adapter around git-cas that preserves the current
  read/ref/commit laws while retiring redundant raw plumbing.

The successor is a blocker for `INFRA_substrate-upgrade-tool`, because
the upgrade boundary should be built against the real current substrate
surface rather than another transitional adapter story.

## User-Facing Change

No public API changes.

The user-facing consequence is indirect: v17's Git-backed runtime now
has one less duplicate write-side plumbing implementation, and the
remaining substrate work is named by exact behavioral gap instead of a
catch-all "unify everything" card.

## SSJS Scorecard

- Runtime-backed concepts: unchanged; no new fake domain model.
- Boundary validation: unchanged; object OID validation still happens
  before local reads and ref operations.
- Behavior ownership: object writes move to the owning git-cas
  persistence adapter; graph-specific read/ref/commit behavior stays
  with `GitGraphAdapter`.
- Ambient effects: unchanged; no new time, entropy, or host APIs in
  domain code.
- Streaming posture: preserved; large blob reads still request an
  unbounded collect explicitly instead of using the current git-cas
  bounded read helper.
- Cast posture: improved; the old blob-read casts in the touched source
  path were removed.
