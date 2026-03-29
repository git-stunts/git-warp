# Streaming CAS Blob Storage

Status: IMPLEMENTED

Legend: Observer Geometry

Cycle: OG-014

## Why This Note Exists

Content blob attachments in `git-warp` have two structural problems that
compound each other:

1. CAS blob storage is opt-in. Callers who do not inject a `BlobStoragePort` get
   raw unchunked Git blobs with no deduplication, no encryption path, and no
   streaming restore. The substrate's chunking capability is present but silently
   bypassed by default.

2. Neither the write path nor the read path supports streaming. Writers must
   buffer the entire payload before handing it to `attachContent()`. Readers get
   the entire blob materialized into memory before they can process it.

`git-cas` already supports streaming on both sides (`store({ source })` accepts
any readable, `restoreStream()` returns `AsyncIterable<Buffer>`). The streaming
substrate exists. It is not expressed through the public attachment API.

## IBM Design Thinking Framing

### Sponsor Human

An application developer attaching documents, media, or artifacts to a WARP
graph.

This person needs to:

- attach large files without buffering the whole payload in process memory
- read attached content incrementally (pipe to disk, HTTP response, etc.)
- trust that the substrate handles chunking and deduplication without explicit
  opt-in
- understand the cost difference between buffered and streaming reads

### Sponsor Agent

A coding agent managing content-bearing graph nodes on behalf of a user or
pipeline.

This agent needs to:

- discover that `attachContent()` accepts a stream, not just a buffer
- choose between `getContent()` (buffered) and `getContentStream()` (streaming)
  based on payload size
- avoid accidentally buffering large payloads by following the simplest API path

### Sponsor Tooling

A debugger, sync pipeline, or transfer planner that needs to inspect or move
content blobs between coordinates.

This sponsor needs to:

- stream content through transfer operations without double-buffering
- rely on CAS chunking for efficient delta transfers
- trust that content OIDs are CAS tree OIDs with stable chunk structure

If the API serves one sponsor while silently degrading for the others, the
design has failed.

## Hills

### Hill 1 — Every blob is chunked

As an application developer, every content blob I attach to a WARP graph is
CDC-chunked through git-cas, regardless of how I opened the graph or whether I
explicitly configured blob storage. There is no path where my blobs silently
bypass chunking.

### Hill 2 — Writes stream in

As an application developer, I can pipe a readable source (file stream, HTTP
body, async generator) directly into `attachContent()` without buffering the
entire payload in memory first.

### Hill 3 — Reads stream out

As an application developer, I can consume attached content incrementally via
`getContentStream()`, deciding myself whether to buffer, pipe, or process
chunk-by-chunk. The buffered `getContent()` remains available as convenience but
is no longer the only option.

## Invariants

1. **CAS is mandatory for content blobs.** `attachContent()` and
   `attachEdgeContent()` always go through `BlobStoragePort`. The raw
   `persistence.writeBlob()` fallback for content is removed.

2. **`AsyncIterable<Uint8Array>` is the domain stream type.** It is universal
   across Node, Bun, and Deno. No `node:stream` dependency in domain code.
   Infrastructure adapters convert to/from runtime-specific stream types at the
   port boundary.

3. **Backward compatibility for legacy blobs.** Content written as raw Git blobs
   before CAS migration remains readable. `CasBlobAdapter.retrieveStream()`
   falls back to yielding a single chunk from `persistence.readBlob()` when the
   OID is not a CAS manifest.

4. **`getContent()` / `getEdgeContent()` return types do not change.** They
   remain `Promise<Uint8Array | null>` — buffered convenience methods
   implemented on top of the stream primitive.

5. **Port contract is the boundary.** `BlobStoragePort` defines the abstract
   streaming contract. `CasBlobAdapter` implements it for Git-backed graphs.
   `InMemoryBlobStorageAdapter` implements it for browser and test paths. No
   domain code knows which adapter is active.

## Non-Goals

- **No automatic migration.** Existing raw Git blobs are not rewritten to CAS.
  They are read through the backward-compat fallback path.
- **No encryption by default.** Encryption remains an opt-in CAS capability
  configured at adapter construction time. This design makes CAS mandatory, not
  encryption.
- **No whole-state streaming.** Out-of-core materialization and streaming
  enumeration of graph state is OG-013. This item is specifically about content
  attachment I/O.
- **No patch blob streaming.** `patchBlobStorage` (for encrypted patch CBOR) is
  a separate concern. This design covers content attachments only.

## Key Design Decisions

### D1 — `BlobStoragePort` grows streaming methods

Current contract:

```text
store(content, options)       → Promise<string>
retrieve(oid)                 → Promise<Uint8Array>
```

New contract:

```text
store(source, options)        → Promise<string>
retrieve(oid)                 → Promise<Uint8Array>
storeStream(source, options)  → Promise<string>
retrieveStream(oid)           → AsyncIterable<Uint8Array>
```

`store()` keeps its current signature for backward compat with simple callers.
`storeStream()` accepts `AsyncIterable<Uint8Array>` as `source`.
`retrieveStream()` returns `AsyncIterable<Uint8Array>`.
`retrieve()` becomes sugar: collect `retrieveStream()` into a single buffer.

### D2 — Write input normalization

`attachContent()` and `attachEdgeContent()` accept a union type:

```text
AsyncIterable<Uint8Array> | ReadableStream<Uint8Array> | Uint8Array | string
```

A domain utility (`normalizeToAsyncIterable()`) converts all input shapes to
`AsyncIterable<Uint8Array>` before calling `storeStream()`. This keeps the port
boundary clean while the public API remains ergonomic.

For `Uint8Array` and `string` inputs, the size and mime metadata can still be
inferred synchronously before streaming. For true streaming inputs, callers
should provide `size` in the metadata options if they know it.

### D3 — `InMemoryBlobStorageAdapter`

A new infrastructure adapter implementing `BlobStoragePort` with `Map`-based
storage. No CDC chunking — it stores and retrieves content directly. Its purpose
is port conformance, not chunking behavior.

This adapter is used by:

- `InMemoryGraphAdapter`-based graphs (browser, tests)
- Any context where `@git-stunts/plumbing` is not available

### D4 — Auto-construction of blob storage

When `WarpRuntime.open()` receives a `persistence` adapter that has `plumbing`
(i.e., a `GitGraphAdapter`), it auto-constructs a `CasBlobAdapter` internally
if no explicit `blobStorage` was provided. This makes CAS the default without
requiring callers to manually wire it.

When `persistence` does not have `plumbing` (i.e., `InMemoryGraphAdapter`), and
no `blobStorage` was provided, it auto-constructs an
`InMemoryBlobStorageAdapter`.

The `blobStorage` parameter remains available for callers who want explicit
control (e.g., to provide an encryption key).

### D5 — Public surface placement

Content stream methods land on both `WarpApp` and `WarpCore`:

- `getContentStream(nodeId)` → `AsyncIterable<Uint8Array> | null`
- `getEdgeContentStream(from, to, label)` → `AsyncIterable<Uint8Array> | null`

These delegate to `WarpRuntime`, which delegates to `query.methods.js`.

`getContent()` / `getEdgeContent()` also get exposed on `WarpApp` and
`WarpCore` (currently missing — a pre-existing gap).

### D6 — Content metadata on streams

`getContentMeta(nodeId)` returns `{ oid, mime, size }` without reading the
blob. Callers who want to decide between buffered and streaming reads based on
size can check metadata first:

```javascript
const meta = await app.getContentMeta(nodeId);
if (meta && meta.size > THRESHOLD) {
  for await (const chunk of app.getContentStream(nodeId)) { /* ... */ }
} else {
  const buf = await app.getContent(nodeId);
}
```

This pattern is already supported — `getContentMeta()` exists on `WarpRuntime`.
It just needs to be surfaced on `WarpApp` / `WarpCore`.

## Checkpoint Gates

### Checkpoint 1 — Doctrine

- [ ] This design doc reviewed and accepted
- [ ] OG-014 backlog item updated and marked ACTIVE
- [ ] No conflicts with OG-013 (out-of-core) or existing CAS work (B158–B164)

### Checkpoint 2 — Spec

- [ ] `BlobStoragePort` streaming contract tests written (red)
- [ ] `InMemoryBlobStorageAdapter` contract tests written (red)
- [ ] `CasBlobAdapter` streaming tests written (red)
- [ ] `attachContent()` streaming input tests written (red)
- [ ] `getContentStream()` / `getEdgeContentStream()` tests written (red)
- [ ] Auto-construction tests written (red)
- [ ] Legacy raw blob backward-compat tests written (red)

### Checkpoint 3 — Semantic

- [ ] `BlobStoragePort` updated with `storeStream()` / `retrieveStream()`
- [ ] `CasBlobAdapter` implements streaming via `git-cas`
- [ ] `InMemoryBlobStorageAdapter` created and wired
- [ ] `PatchBuilderV2` accepts streaming input
- [ ] `query.methods.js` implements `getContentStream()` /
      `getEdgeContentStream()`
- [ ] `WarpRuntime.open()` auto-constructs blob storage
- [ ] Raw `writeBlob()` fallback removed from content write path
- [ ] All spec tests green
- [ ] Full test suite green (4000+ tests)
- [ ] `WarpGraph.noCoordination.test.js` passes

### Checkpoint 4 — Surface

- [ ] `WarpApp` and `WarpCore` expose content methods
- [ ] `index.d.ts` updated with streaming types
- [ ] `index.js` exports `InMemoryBlobStorageAdapter`
- [ ] CHANGELOG updated
- [ ] ROADMAP reconciled
- [ ] README updated if content examples exist

## Affected Files

### Ports

- `src/ports/BlobStoragePort.js` — add `storeStream()`, `retrieveStream()`

### Infrastructure

- `src/infrastructure/adapters/CasBlobAdapter.js` — implement streaming methods
- `src/infrastructure/adapters/InMemoryBlobStorageAdapter.js` — new adapter
- `src/infrastructure/adapters/lazyCasInit.js` — no change expected

### Domain

- `src/domain/services/PatchBuilderV2.js` — streaming write input,
  `normalizeToAsyncIterable()` call
- `src/domain/warp/query.methods.js` — `getContentStream()`,
  `getEdgeContentStream()`
- `src/domain/warp/patch.methods.js` — forward blob storage (already done)
- `src/domain/WarpRuntime.js` — auto-construct blob storage in `open()`
- `src/domain/WarpApp.js` — expose content methods
- `src/domain/WarpCore.js` — expose content methods
- `src/domain/utils/streamUtils.js` — new: `normalizeToAsyncIterable()`,
  `collectAsyncIterable()`

### Tests

- `test/unit/ports/BlobStoragePort.test.js` — streaming contract tests
- `test/unit/infrastructure/adapters/CasBlobAdapter.test.js` — streaming tests
- `test/unit/infrastructure/adapters/InMemoryBlobStorageAdapter.test.js` — new
- `test/unit/domain/services/PatchBuilderV2.content.test.js` — streaming input
- `test/unit/domain/WarpGraph.content.test.js` — streaming read tests
- `test/integration/api/content-attachment.test.js` — streaming round-trips

### Public Surface

- `index.js` — export `InMemoryBlobStorageAdapter`
- `index.d.ts` — streaming type declarations
