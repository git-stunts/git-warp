---
id: INFRA_extract-warp-orset-package-post-publish
blocked_by:
  - INFRA_multipackage-publish-pipeline
  - PROTO_orsetlike-contract
  - PROTO_shadow-trie-orset
blocks: []
feature: trie-state-storage
---

# Extract warp-orset as a real published workspace package (post-publish)

## Problem

Cycle 0020 attempted to extract `warp-orset` from root and was closed
as `not-met`: the workspace package was `private: true` and flipping
it public required a multi-package release pipeline that didn't
exist.

This item is the deferred successor. Deliberately a new ID — NOT
reusing `INFRA_extract-warp-orset-package` to keep backlog history
clean.

## Fix

Move ORSet code from root into `packages/warp-orset/`, flip the
package to public, and make root declare it as a dependency.

**Prerequisites (must be complete before this item can start):**
- `INFRA_multipackage-publish-pipeline` — multi-package release
  pipeline exists and works
- `PROTO_orset-seam-in-root` — seam is organized inside root
- `PROTO_orsetlike-contract` — interface is extracted, consumers
  retyped
- `PROTO_shadow-trie-orset` — the ORSet API is stable (the
  implementation exists in root, passing its tests)

**Work:**
1. Remove `"private": true` from `packages/warp-orset/package.json`
2. Move `src/domain/crdt/{ORSet,Dot,VersionVector,LWW}.ts` (and any
   trie/cursor/session code the seam organized) into
   `packages/warp-orset/src/`
3. Update `packages/warp-orset/src/index.ts` with real exports
4. Rewrite root imports from `../crdt/ORSet.ts` (etc.) to
   `@git-stunts/warp-orset`
5. Update root `package.json` to declare `@git-stunts/warp-orset`
   as a dependency (pinned at current lock-step version)
6. Update `jsr.json` if JSR handling needs per-package config
7. Update `browser.ts` re-export of `VersionVector`
8. Update all test files' imports
9. Update `tsconfig.src.json`, `tsconfig.test.json`,
   `vitest.config.js` coverage include, `eslint.config.js` globs

## Scope

**In:** The actual code move and import rewrites. Flipping
warp-orset public.

**Out:** Publish pipeline design (that's
`INFRA_multipackage-publish-pipeline`). Seam organization (that's
`PROTO_orset-seam-in-root`). Interface extraction (that's
`PROTO_orsetlike-contract`). The ORSet implementation itself (that's
`PROTO_shadow-trie-orset` and friends).

## Notes

- This item is deliberately deferred until the publish pipeline
  exists AND the ORSet API is stable. Extracting unstable code into
  a workspace package creates a version-lock trap.
- The ID is new (`-post-publish` suffix) to preserve the history of
  cycle 0020's `not-met` outcome. Do not rename this item to reuse
  the old ID.
