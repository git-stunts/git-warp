---
blocked_by: []
blocks: []
id: INFRA_underused-ecosystem-packages
feature: testing-quality
---

# git-stunts ecosystem packages are underused

## Findings

### @git-stunts/git-cas (content storage)
- Used by: `CasBlobAdapter`, `CasSeekCacheAdapter` (2 adapters)
- NOT used by: entire index subsystem (`StreamingBitmapIndexBuilder`,
  `BitmapIndexBuilder`, `BitmapIndexReader`, `IndexRebuildService`),
  which hand-rolls content storage via raw `writeBlob`/`readBlob` with
  JSON envelopes and manual checksums
- Impact: no streaming, no dedup, no compression, no encryption, buffers
  everything in memory

### @git-stunts/alfred (resilience)
- Used by: `SyncController` (retry + timeout), `GitGraphAdapter` (retry)
- NOT used by: any other async I/O path — all index writes, trust chain
  reads, provenance walks, checkpoint persistence, etc. run unprotected
- Impact: no retry, no timeout, no circuit breaking on I/O failures

### @git-stunts/trailer-codec (commit message trailers)
- Used by: `MessageCodecInternal.ts` (1 file, with `@ts-expect-error`)
- The 12-file internal codec layer wraps it, so it IS the substrate —
  but the integration is rough (no types, error suppression)

## Action

- git-cas migration tracked as `INFRA_index-builder-on-git-cas` and
  `INFRA_unify-persistence-on-git-cas`
- Alfred adoption and trailer-codec type integration are separate items
