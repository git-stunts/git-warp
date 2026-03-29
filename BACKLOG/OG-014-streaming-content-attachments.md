# OG-014 — Mandatory CAS blob storage with streaming I/O

Status: ACTIVE

Legend: Observer Geometry

Design doc: `docs/design/streaming-cas-blob-storage.md`

## Problem

Content blob attachments in `git-warp` have two structural problems:

### 1. CAS blob storage is opt-in

`attachContent()` and `attachEdgeContent()` accept an optional `blobStorage`
injection. When callers do not provide it, blobs fall through to raw
`persistence.writeBlob()` — a single unchunked Git object with no CDC
deduplication, no encryption support, and no streaming restore path.

This means the substrate's chunking, deduplication, and encryption capabilities
are present but silently bypassed by default. There is no good reason for a
content blob to skip CAS. Every blob should be chunked.

### 2. Neither write nor read paths support streaming

**Write path**: `attachContent(nodeId, content)` accepts `Uint8Array | string`.
The caller must buffer the entire payload in memory before handing it to the
patch builder. `CasBlobAdapter.store()` then wraps that buffer in
`Readable.from([buf])` — a synthetic stream from an already-buffered payload.

**Read path**: `getContent(nodeId)` returns `Promise<Uint8Array | null>`. The
full blob is materialized into memory before the caller can process it.
`CasBlobAdapter.retrieve()` calls `cas.restore()` which buffers internally.

`git-cas` already supports streaming on both sides:
- `cas.store({ source })` accepts any readable/iterable source
- `cas.restoreStream()` returns `AsyncIterable<Buffer>`

The streaming substrate is there. It is not expressed through the public API.

## Why this matters

WARP graphs can carry attached documents, media, model weights, and other
payloads that are legitimately large. The API should not force full in-memory
buffering on either side of the I/O boundary.

- Callers writing large content should be able to pipe a stream in
- Callers reading large content should be able to consume it incrementally
- Every blob should get CDC chunking and deduplication as a substrate guarantee
- The decision between buffered and streaming I/O should belong to the caller

## Current state

As of `v15.0.1`:

- `BlobStoragePort`: `store(content, options) → Promise<string>`,
  `retrieve(oid) → Promise<Uint8Array>` — both buffered
- `CasBlobAdapter`: fully implemented CAS adapter with CDC chunking, optional
  encryption, backward-compat fallback to raw Git blobs — but only buffered I/O
- `CasBlobAdapter` is internal (not exported from `index.js`)
- `PatchBuilderV2.attachContent()`: accepts `Uint8Array | string`, uses
  `blobStorage.store()` if injected, else raw `persistence.writeBlob()`
- `getContent()` / `getEdgeContent()`: returns `Promise<Uint8Array | null>`,
  uses `blobStorage.retrieve()` if injected, else raw `persistence.readBlob()`
- `WarpApp` and `WarpCore` do not expose content read methods at all
- `git-cas` streaming (`restoreStream()`) is already used in
  `CasSeekCacheAdapter` but not in blob reads
- `InMemoryGraphAdapter` has `writeBlob()`/`readBlob()` for browser/test path

## Desired outcome

1. CAS blob storage is mandatory — no fallback to raw `writeBlob()` for content
2. Write path accepts streaming input and pipes through without buffering
3. Read path returns a stream the caller can consume incrementally
4. Buffered convenience methods remain available, layered on top of streams
5. Browser and in-memory paths still work via a conforming adapter
6. Legacy raw Git blob attachments remain readable for backward compatibility

## Acceptance criteria

1. Every content blob written through `attachContent()` / `attachEdgeContent()`
   goes through `BlobStoragePort` — no raw `persistence.writeBlob()` fallback.
2. `attachContent()` / `attachEdgeContent()` accept streaming input
   (`AsyncIterable<Uint8Array>`, `ReadableStream`, `Uint8Array`, `string`).
3. New `getContentStream()` / `getEdgeContentStream()` return
   `AsyncIterable<Uint8Array>` for incremental consumption.
4. Existing `getContent()` / `getEdgeContent()` remain as buffered convenience,
   implemented on top of the stream primitive.
5. `BlobStoragePort` grows `storeStream()` and `retrieveStream()` methods.
6. `CasBlobAdapter` implements streaming via `git-cas` natively.
7. An `InMemoryBlobStorageAdapter` implements the port contract for browser and
   test paths.
8. Legacy raw Git blob attachments remain readable through backward-compat
   fallback in `CasBlobAdapter.retrieveStream()`.
9. Content stream methods are exposed on `WarpApp` and `WarpCore`.

## Non-goals

- No automatic migration of existing raw Git blobs to CAS format
- No silent breaking change to existing `getContent()` / `getEdgeContent()`
  return types
- No attempt to solve whole-state out-of-core replay (that is OG-013)
- No encryption-by-default (encryption remains an opt-in CAS capability)

## Notes

This item supersedes the original OG-014 scope, which covered only streaming
reads. The expanded scope now includes mandatory CAS and streaming writes.

Related items:
- `OG-013`: out-of-core materialization and streaming reads (broader, separate)
- `B160`: blob attachments via CAS (done, but opt-in — this item makes it
  mandatory)
- `B163`: streaming restore for seek cache (done, pattern to follow for blobs)
