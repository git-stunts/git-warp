---
id: INFRA_index-builder-on-git-cas
blocks: []
blocked_by:
  - INFRA_unify-persistence-on-git-cas
---

# Migrate StreamingBitmapIndexBuilder to git-cas

## Problem

`StreamingBitmapIndexBuilder` (835 LOC) reimplements content storage
patterns that git-cas already provides:

- **Versioned JSON envelopes** with manual checksums — git-cas manifests
  provide integrity verification natively.
- **Multi-chunk shard merging** — loads flushed OIDs, deserializes,
  ORs bitmaps, re-serializes, writes new blob. git-cas CDC chunking
  would deduplicate overlapping content automatically.
- **No compression** — git-cas provides gzip before write.
- **No encryption** — git-cas supports AES-256-GCM envelope encryption.
- **No streaming** — finalize buffers everything. git-cas has streaming
  restore with O(chunkSize) memory.

~200 LOC of the builder is envelope/checksum/merge I/O that git-cas
would subsume.

## Fix

Replace `IndexStoragePort.writeBlob()`/`readBlob()` calls with a
`CasIndexStorageAdapter` that wraps git-cas:

1. `flush()` stores shard chunks via `cas.store()` instead of raw
   `writeBlob()` with hand-rolled envelopes.
2. `_mergeChunks()` uses `cas.restoreStream()` instead of loading
   blobs and parsing JSON envelopes.
3. `finalize()` tree assembly stays the same (git-cas `createTree()`).
4. Checksums and version headers become unnecessary — git-cas manifests
   handle integrity.

## Depends on

`INFRA_unify-persistence-on-git-cas` sets the pattern for adapter
migration. This item follows that pattern for the index subsystem.

## Scope estimate

- New `CasIndexStorageAdapter` in `src/infrastructure/adapters/`
- Update `StreamingBitmapIndexBuilder` to drop envelope logic
- Update `IndexRebuildService` if it reads envelopes directly
- Migration test: verify old-format indexes are still readable
