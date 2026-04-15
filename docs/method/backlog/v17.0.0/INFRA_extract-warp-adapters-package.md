---
id: INFRA_extract-warp-adapters-package
blocked_by:
  - INFRA_npm-workspaces-scaffold
  - PROTO_index-builder-trie-iteration
  - PERF_trie-geometry-and-memory-profile
blocks: []
---

# Extract Git/CAS/runtime adapters into packages/warp-adapters

## Problem

Infrastructure adapters (GitGraphAdapter, CasBlobAdapter,
CasSeekCacheAdapter, GitTrustChainAdapter, crypto adapters, HTTP
adapters, loggers) currently live in `src/infrastructure/`. Once the
index builder and materialization adapters are proven with trie-backed
ORSets, these can be extracted into their own package.

## Fix

Move `src/infrastructure/adapters/` and `src/ports/` into
`packages/warp-adapters/src/`. Wire up dependencies on `warp-kernel`.
The `git-warp` product package becomes a thin shell over the three
engine packages.

## Scope

**In:** Code move. Import rewrites. Test verification. Package
boundary definition.

**Out:** This is deliberately the last extraction. Do not freeze
package boundaries before the ORSet line proves them.

## Existing v17 links

- TS_infrastructure-adapters — TypeScript conversion of infra adapters.
  Extraction should happen after conversion is complete.
- INFRA_plumbing-violations — plumbing API misuse in adapters. Fix
  before or during extraction.
- INFRA_unify-persistence-on-git-cas — CAS unification affects adapter
  internals. Coordinate with extraction.
- INFRA_index-builder-on-git-cas — index storage migration. Must be
  settled before adapter package boundaries freeze.
