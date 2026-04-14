# Complete git-cas migration — kill raw plumbing blob path

## Problem

`GitGraphAdapter.readBlob()` uses raw `git cat-file blob` via plumbing,
bypassing git-cas entirely. Plumbing's `collect()` has a 10MB default
buffer limit. Checkpoint blobs on large repos exceed this and crash.

The intent was that ALL blob I/O goes through git-cas (chunked, streaming,
content-addressed). Three adapters already use git-cas correctly:
CasBlobAdapter, CasSeekCacheAdapter, GitTrustChainAdapter. But the base
`BlobPort` implementation (GitGraphAdapter) still shells out to raw git.

~60-70% of blob reads bypass git-cas.

## Why this is harder than it looks

**The core infrastructure data was never written through CAS.**

Checkpoints, patches, and index shards are written via
`GitGraphAdapter.writeBlob()` → `git hash-object -w --stdin` (raw git).
Their OIDs are raw blob OIDs, not CAS tree OIDs. You cannot read them
via `cas.readManifest()` because they have no manifest — they're just
git blobs.

A CAS-first-then-fallback approach would mean every read attempts a CAS
manifest lookup (which fails for all existing data), then falls back to
raw git (which still hits the 10MB limit). This is both slow and doesn't
solve the problem.

**To actually use CAS for reads, the writes must go through CAS first.**
But changing `writeBlob()` to use CAS changes the OID semantics: raw
blob OIDs become CAS tree OIDs. Every consumer that puts those OIDs into
commit trees, compares them, or passes them to `readTreeOids()` breaks.

## The real fix (two phases)

### Phase A: Storage format migration (v17.1)

1. `CborCheckpointStoreAdapter`, `CborPatchJournalAdapter`, and
   `CborIndexStoreAdapter` switch from `blobPort.writeBlob()` to
   `cas.store()` + `cas.createTree()`.
2. Their read paths switch to `cas.readManifest()` + `cas.restore()`
   with fallback to `blobPort.readBlob()` for pre-migration data.
3. The OIDs stored in commit trees become CAS tree OIDs. This is a
   **wire format change** — existing repos need a one-time migration
   checkpoint that rewrites blob refs to CAS tree refs.
4. `GitGraphAdapter.readBlob()` stays as raw plumbing — it's the
   low-level escape hatch. The CBOR adapters stop calling it for
   normal reads.

### Phase B: Streaming reads (v17.2)

1. Add `readBlobStream(oid): AsyncIterable<Uint8Array>` to BlobPort.
2. `GitGraphAdapter.readBlobStream()` → plumbing `executeStream()`
   WITHOUT calling `collect()`. Callers iterate chunks directly.
3. Checkpoint deserializer, index reader, etc. consume streams.

## Immediate unblock for Think (stopgap)

The Think crash is in `@git-stunts/plumbing`'s 10MB default buffer.
The quickest unblock that isn't a hack:

**Raise the limit in plumbing.** The 10MB default was set as a safety
net against OOM, but git objects legitimately exceed 10MB (CBOR-encoded
checkpoint state). A 512MB limit (matching git-cas's
`maxRestoreBufferSize`) is reasonable.

Alternatively: Think can pass `maxBuffer` when constructing plumbing.

## Priority

Phase A is v17.1. Phase B is v17.2. Think unblock is ASAP (plumbing fix).
