---
id: INFRA_substrate-upgrade-tool
blocks: []
blocked_by:
  - INFRA_unify-persistence-on-git-cas
---

# `git warp upgrade` — substrate migration tool

## Problem

As WARP's internal format evolves (Uint8Array migration, codec changes,
git-cas adoption), there is no way to migrate existing graphs to the
new substrate. Without a tool, we either carry infinite backward-compat
fallbacks or abandon old data.

## The tool

`git warp upgrade` runs offline, walks all existing objects in a WARP
graph, and migrates them to the current substrate version.

### What it migrates

- Hand-rolled blobs → git-cas (chunked, CDC, manifest-backed)
- Patches, checkpoints, index shards, materialized states, trust records
- Refs updated to point at new git-cas trees
- Old loose blobs become unreachable → `git gc` prunes them

### Design

- **Version-aware**: reads current substrate version from graph metadata,
  knows the target version, applies only pending migrations
- **Migration steps**: ordered, named (like database migrations)
  - `0001_raw-blobs-to-cas.ts`
  - `0002_trust-chain-to-streaming.ts`
  - etc.
- **Idempotent**: safe to re-run if interrupted mid-migration
- **Progressive**: can migrate one graph at a time, reports progress
  (objects migrated, space saved, time elapsed)
- **Offline**: requires no concurrent writers. Could enforce via a lock
  ref that blocks `createPatch` during migration

### Complements the gradual approach

The runtime can also do gradual migration (write new → git-cas, read
old → fallback, same as CasBlobAdapter). The upgrade tool is for
deliberate version bumps where you want a clean break and immediate
space reclaim.

### Substrate version storage

Needs a canonical location for the current substrate version. Options:
- A ref: `refs/warp/<graph>/substrate-version` → blob with version number
- A field in the anchor message
- A file in the graph's root tree

TBD during implementation.
