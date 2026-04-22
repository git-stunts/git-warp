---
id: INFRA_index-builder-on-git-cas
blocks: []
blocked_by: []
feature: materialization-query-index
---

# Migrate StreamingBitmapIndexBuilder to git-cas

## Problem

`StreamingBitmapIndexBuilder` (835 LOC) reimplements content storage
that git-cas already provides — and does it worse:

1. **Buffers entire shards in memory** via `JSON.stringify`/`JSON.parse`.
   git-cas streams data. We must not assume the full index fits in RAM.
2. **Hand-rolled integrity** — versioned JSON envelopes with manual
   SHA-256 checksums (~200 LOC). git-cas manifests provide integrity
   natively via content-addressed chunk digests.
3. **No dedup** — identical shard data written multiple times as separate
   blobs. git-cas CDC chunking deduplicates at ~98% reuse on small edits.
4. **No compression** — git-cas provides gzip before write.
5. **No encryption** — git-cas supports AES-256-GCM envelope encryption.

Indexes are **cache-only** (regenerable). No backward compatibility with
the old envelope format is required. A migration path will invalidate
existing caches.

## Execution (combined with god kill)

### Phase 1: Kill the god + drop envelope layer

Split `StreamingBitmapIndexBuilder.js` (835 LOC) into TypeScript:

- `BitmapAccumulator.ts` (~150 LOC) — pure domain: registerNode,
  addEdge, ID allocation, memory tracking. No I/O.
- `ShardSerializer.ts` (~100 LOC) — serialize bitmaps to CBOR shard
  format (not JSON envelopes). Encoding only, no storage writes.
- `StreamingBitmapIndexBuilder.ts` (~250 LOC) — slim orchestrator:
  flush threshold, finalize, merge, tree assembly. Writes via
  `IndexStoragePort` with plain CBOR — no envelopes.

Delete: `parseShardEnvelope`, `validateShardEnvelope`,
`serializeMergedShard`, `computeChecksum` usage, `SHARD_VERSION`
references, `_loadAndValidateChunk`, `_writeMergedEnvelope`.

### Phase 2: CasIndexStorageAdapter

New adapter in `src/infrastructure/adapters/`:

```
CasIndexStorageAdapter implements IndexStoragePort
  - writeBlob/readBlob → git-cas store/restore (streaming)
  - writeTree/readTreeOids → git-cas createTree/readManifest
  - updateRef/readRef → @git-stunts/plumbing (git operations)
```

Content storage flows through git-cas. Ref operations flow through
plumbing. Clean hexagonal split.

### Phase 3: Wire and test

- `IndexRebuildService` passes `CasIndexStorageAdapter`
- Integration test: rebuild index → verify logical reads work
- Old-format indexes: invalidated on upgrade (cache-only)

## Substrate rules

- **@git-stunts/plumbing** = git operations (commits, refs, log)
- **@git-stunts/git-cas** = content storage in Git (store, restore,
  stream, dedup, integrity, encryption, compression)
- Domain code MUST NOT assume full graph/index fits in memory
