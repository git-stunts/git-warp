# ORSet Seam — Root-Local Home for warp-orset-Destined Code

This directory establishes the **root-local seam** for code that will
eventually live in the `@git-stunts/warp-orset` package.

Design reference: [0018 Shadow-Trie ORSet](../../../docs/design/0018-shadow-trie-orset/shadow-trie-orset.md).

## Why this directory exists

Cycle 0020 attempted to extract `@git-stunts/warp-orset` directly and
was closed as `not-met`: extracting a published package requires a
multi-package release pipeline that doesn't exist yet. Until that
pipeline lands (see `INFRA_multipackage-publish-pipeline`), all
warp-orset-destined code stays inside root.

This directory — plus the existing `src/domain/crdt/` — is that home.

## Current inventory (warp-orset-destined code in root)

| Root path | Future warp-orset path |
|-----------|------------------------|
| `src/domain/crdt/ORSet.ts` | `packages/warp-orset/src/crdt/ORSet.ts` |
| `src/domain/crdt/Dot.ts` | `packages/warp-orset/src/crdt/Dot.ts` |
| `src/domain/crdt/VersionVector.ts` | `packages/warp-orset/src/crdt/VersionVector.ts` |
| `src/domain/crdt/LWW.ts` | `packages/warp-orset/src/crdt/LWW.ts` |

The existing `src/domain/crdt/` directory continues to hold CRDT
primitives. It is part of the warp-orset seam. When extraction
happens, its contents move into `packages/warp-orset/src/crdt/`.

## Future additions — where they go

New ORSet-related code that is NOT a CRDT primitive lands here in
`src/domain/orset/`, organized into subdirectories that mirror the
eventual warp-orset package layout:

| Planned subdir | What goes there | Backlog item | Status |
|----------------|-----------------|--------------|--------|
| `src/domain/orset/route/` | `RouteKey.ts`, `nibbleAt()`, blake3 helpers | `PROTO_blake3-route-key` | ✅ cycle 0022 |
| `src/domain/orset/trie/` | `TrieStorePort.ts`, `TrieBranchEntries.ts` (cycle 0026); `TrieGeometry.ts`, `TrieLeaf.ts`, `TrieBranch.ts` (cycle 0027); `GitTrieStoreAdapter.ts` lives under `src/infrastructure/adapters/` (cycle 0028); `TrieCursor.ts`, `DirtyPageSet.ts` (cycle 0029); `TrieFlusher.ts`, `FlushResult.ts` (cycle 0030); `PageCache.ts`, `PageCacheStats.ts` (cycle 0031); `TrieCompactor.ts` (cycle 0039) | `PROTO_git-trie-store-port`, `PROTO_trie-codec-and-geometry`, `INFRA_git-trie-store-adapter`, `PROTO_trie-cursor`, `PERF_lru-page-cache`, `PROTO_trie-flush`, `PROTO_trie-compaction` | port: cycle 0026; codec+geometry: cycle 0027; adapter: cycle 0028; cursor: cycle 0029; flush: cycle 0030; LRU: cycle 0031; compaction: cycle 0039 |
| `src/domain/orset/session/` | `StateSession.ts`, `StateSessionCloseResult.ts` | `PROTO_state-session-async` | ✅ cycle 0040 |
| `src/domain/orset/shadow/` | `ShadowTrieORSet.ts` | `PROTO_shadow-trie-orset` | ✅ cycle 0038 |
| (no ORSetLike) | Sync-only seam contract; premise was invalid — `ShadowTrieORSet` is async behind `StateSession`, so a sync "-Like" parent has a single impl forever. See cycle 0023 retro. | `PROTO_orsetlike-contract` | ✗ cycle 0023 (not-met) |

The `crdt/` subdir lives at `src/domain/crdt/` (not under `orset/`)
for historical reasons — moving it would force 208 import rewrites,
then another 208 rewrites when extraction happens. Keeping it in
place means one rewrite, not two. The seam boundary is conceptual,
not physical.

## Import rules

These rules hold while the code stays in root:

- **NO** bare `@git-stunts/warp-orset` imports from root code. The
  package is `private: true` (cycle 0019). Any shipped root `.ts`
  file that imports from it produces a private-package import bomb
  for consumers of `@git-stunts/git-warp`.
- **NO** relative imports into `packages/warp-orset/` from shipped
  root code. That's a fake package boundary.
- Root code imports the ORSet primitives via relative paths to
  `src/domain/crdt/` and future code to `src/domain/orset/`.

## Ownership rule

- `StateSession` is the future lifetime owner for session-scoped trie
  internals such as `PageCache` and the internal `TrieCursor`
  instances.
- `TrieCursor` and `PageCache` are implementation details. Do not
  introduce a public `TrieCursorPort`; keep the behavioral seam at the
  session layer.

## Extraction plan (future work, not this cycle)

When `INFRA_multipackage-publish-pipeline` lands AND the ORSet API
is stable, `INFRA_extract-warp-orset-package-post-publish` executes
the move:

1. `src/domain/crdt/*` → `packages/warp-orset/src/crdt/*`
2. `src/domain/orset/*` → `packages/warp-orset/src/*`
3. Flip `packages/warp-orset/package.json` to `"private": false`
4. Rewrite all root imports from relative paths to
   `@git-stunts/warp-orset/...`
5. Declare `@git-stunts/warp-orset` as a dependency in root's
   `package.json`

Until then, this directory is the home for all new warp-orset-destined
code that isn't a CRDT primitive.

## Maintaining this document

- When a new subdirectory is added here, list it in the "Future
  additions" table above with its backlog item reference.
- When an extraction moves code out, update the "Current inventory"
  table to reflect the remaining root-local code.
- If the seam strategy changes (e.g., extraction happens sooner),
  update this document and the referenced backlog items together.
