# OG-014 — Stream content attachments through git-cas

Status: QUEUED

Legend: Observer Geometry

## Problem

`getContent()` and `getEdgeContent()` currently return full `Uint8Array`
buffers. That means attachment reads materialize the entire payload in memory
before user code can process it.

This is fine for small text blobs, but it is the wrong default shape for large
attachments:

- the attachment may not fit comfortably in memory
- the caller cannot decide between buffered read and stream processing
- builder-facing docs risk teaching attachment reads as eager byte loads
- the current blob-storage abstraction still forces `retrieve()` to return a
  full buffer rather than a stream-capable interface

`git-warp` already contains a `CasBlobAdapter` that stores attachments in
`git-cas` with CDC chunking, but the public attachment path still terminates in
buffered reads. That leaves the most scalable backend present but not fully
expressed through the public API.

## Why this matters

WARP graphs can legitimately carry attached documents, artifacts, and other
payloads that are larger than normal graph properties.

The API should make the memory tradeoff explicit:

- buffered reads when you actually want all bytes in memory
- streaming reads when you want to process incrementally

That decision should belong to the caller, not be forced by the default
attachment API shape.

## Current state

Today the attachment read path is eager:

- `getContent()` -> `Promise<Uint8Array|null>`
- `getEdgeContent()` -> `Promise<Uint8Array|null>`
- `BlobStoragePort.retrieve()` -> `Promise<Uint8Array>`
- default Git blob reads go through `readBlob()` and collect the full blob
- `CasBlobAdapter` can already store attachment content in `git-cas`, but it
  still restores into one full buffer via `retrieve()`
- `git-cas` streaming restore is already used in `CasSeekCacheAdapter`, but not
  yet exposed through attachment reads

## Desired outcome

Make `git-cas` the first-class streaming attachment path without breaking the
simple buffered paths.

Likely shape:

- `getContentStream(nodeId)`
- `getEdgeContentStream(from, to, label)`
- `BlobStoragePort.retrieveStream(oid)`
- `CasBlobAdapter.retrieveStream(oid)` backed by `git-cas restoreStream()`
- a clear default/recommended way to wire `CasBlobAdapter` into `WarpApp.open()`
  / `WarpCore.open()` for attachment storage

Buffered helpers should remain available for convenience, but they should be
clearly layered on top of the stream-capable substrate.

Longer-term, if attachment storage standardizes on `git-cas`, the builder story
gets cleaner too:

- large attachments become chunked CAS assets
- reads can stream incrementally
- dedupe happens below the API surface
- legacy raw Git blob attachments can remain readable for compatibility

## Acceptance criteria

1. `git-warp` exposes explicit streaming APIs for node and edge attachments.
2. Callers can choose stream vs buffered read intentionally.
3. `BlobStoragePort` grows a stream-capable retrieval contract.
4. `CasBlobAdapter` supports streaming retrieval via `git-cas`.
5. `git-cas` becomes the recommended path for large attachment storage.
6. Legacy raw Git blob attachments remain readable for compatibility.
7. Builder docs explain when to use buffered reads vs streams.
8. Large attachment reads no longer require full in-memory buffering by
   default in the stream path.

## Non-goals

- no automatic conversion of all existing attachment reads to streams
- no silent breaking change to `getContent()` / `getEdgeContent()`
- no attempt to solve whole-state out-of-core replay here

## Notes

This item is related to, but narrower than,
`OG-013-out-of-core-materialization-and-streaming-reads.md`.
`OG-013` is about whole-state and replay architecture.
This item is specifically about attachment payload I/O and making
`git-cas` the streaming/chunked attachment path.
