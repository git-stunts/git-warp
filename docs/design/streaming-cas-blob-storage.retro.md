# OG-014 Retrospective — Streaming CAS Blob Storage

Slice: OG-014
Design doc: `docs/design/streaming-cas-blob-storage.md`
Backlog item: `BACKLOG/OG-014-streaming-content-attachments.md`
Landed: 2026-03-29 on `main` (5 commits, 30 files, +1595 / -100 lines)

## Governing Documents

- Design doc: `docs/design/streaming-cas-blob-storage.md` (6 design decisions,
  4 checkpoint gates, 3 hills)
- Original backlog item: `BACKLOG/OG-014-streaming-content-attachments.md`
  (expanded from streaming-reads-only to mandatory CAS + streaming writes +
  streaming reads)

## What Actually Landed

### Commits

1. `5f0cebd` — doctrine: design doc + backlog promotion
2. `5dba666` — spec: 35 red-phase tests across 6 files
3. `af80714` — fix: test alignment + size/mime propagation bug
4. `ea0df5f` — semantic: full implementation, 5203 tests green
5. `05bdb3a` — surface: WarpApp/WarpCore methods, index.js/d.ts, CHANGELOG

### New Production Code

| File | What |
|---|---|
| `src/ports/BlobStoragePort.js` | `storeStream()`, `retrieveStream()` abstract methods |
| `src/domain/utils/defaultBlobStorage.js` | `InMemoryBlobStorageAdapter` — content-addressed Map storage |
| `src/domain/utils/streamUtils.js` | `normalizeToAsyncIterable()`, `isStreamingInput()` |
| `src/infrastructure/adapters/CasBlobAdapter.js` | `storeStream()`, `retrieveStream()` via git-cas |
| `src/domain/services/PatchBuilderV2.js` | Streaming input acceptance, mandatory CAS, no raw fallback |
| `src/domain/warp/query.methods.js` | `getContentStream()`, `getEdgeContentStream()` |
| `src/domain/WarpRuntime.js` | Auto-construction of blob storage in `open()` |
| `src/domain/WarpApp.js` | 8 content read methods on product surface |
| `src/domain/WarpCore.js` | 8 content read methods on plumbing surface |
| `src/domain/services/CheckpointService.js` | Tree mode change: `040000 tree` for content anchors |

### New Test Coverage

- 35 new spec tests (BlobStoragePort, InMemoryBlobStorageAdapter, CasBlobAdapter
  streaming, PatchBuilderV2 streaming input, getContentStream,
  getEdgeContentStream, auto-construction, no-raw-fallback)
- Updated ~20 existing tests for mandatory blobStorage
- All 5203 tests green

## Design Alignment Audit

### Hill 1 — Every blob is chunked
**Aligned.** `attachContent()` and `attachEdgeContent()` now throw
`E_NO_BLOB_STORAGE` without blob storage. `WarpRuntime.open()`
auto-constructs `CasBlobAdapter` (Git) or `InMemoryBlobStorageAdapter`
(browser/test). No path bypasses blob storage.

### Hill 2 — Writes stream in
**Aligned.** `attachContent()` accepts `AsyncIterable<Uint8Array> |
ReadableStream<Uint8Array> | Uint8Array | string`. Streaming inputs route
to `storeStream()` without intermediate buffering.

### Hill 3 — Reads stream out
**Aligned.** `getContentStream()` and `getEdgeContentStream()` return
`AsyncIterable<Uint8Array>`. Buffered `getContent()` / `getEdgeContent()`
remain as convenience.

### D1 — BlobStoragePort grows streaming methods
**Aligned.** `storeStream()` and `retrieveStream()` added. `retrieve()`
remains as-is (not implemented as sugar over `retrieveStream()` — kept
independent for simplicity).

### D2 — Write input normalization
**Aligned.** `normalizeToAsyncIterable()` in `streamUtils.js` handles all
four input types. `isStreamingInput()` detects async iterables and
ReadableStreams.

### D3 — InMemoryBlobStorageAdapter
**Partially aligned.** Adapter created and functional, but lives in
`src/domain/utils/defaultBlobStorage.js` instead of
`src/infrastructure/adapters/` as originally planned. This was a deliberate
architectural decision: the adapter has zero infrastructure dependencies
(only `Map`, `TextEncoder`, `crypto.subtle`), so placing it in domain
follows the `defaultCodec.js` / `defaultClock.js` pattern and avoids a
domain→infrastructure import in `WarpRuntime.js`.

### D4 — Auto-construction of blob storage
**Partially aligned.** Design said auto-construct based on
`persistence.plumbing`. Implementation does this, but uses a dynamic
`import()` for `CasBlobAdapter` — the only domain→infrastructure bridge
in the codebase. Accepted as a pragmatic trade-off: the alternative
(requiring all callers to wire CAS explicitly) contradicts the "every blob
gets chunked" invariant.

### D5 — Public surface placement
**Aligned.** Content methods on both `WarpApp` and `WarpCore`. All 8
content read methods (buffered + streaming, node + edge, for content,
OID, and metadata) exposed.

### D6 — Content metadata on streams
**Aligned.** `getContentMeta()` / `getEdgeContentMeta()` now exposed on
`WarpApp` and `WarpCore` (previously only on `WarpRuntime`). Callers can
check size before deciding buffered vs streaming.

## Observed Drift

### 1. InMemoryBlobStorageAdapter placement
**Design:** `src/infrastructure/adapters/InMemoryBlobStorageAdapter.js`
**Actual:** `src/domain/utils/defaultBlobStorage.js`
**Reason:** Deliberate architectural decision — zero infrastructure deps.
**Resolution:** Accepted. The file name and module path differ from the
design doc but the behavior is identical.

### 2. Content anchor tree mode
**Design:** Not explicitly addressed — design focused on I/O streaming.
**Actual:** Changed `100644 blob` → `040000 tree` in both
`PatchBuilderV2.commit()` and `CheckpointService.createV5()`.
**Reason:** CAS stores content as tree objects, not blobs. Git `mktree`
rejects blob-mode entries pointing at tree OIDs.
**Resolution:** Accepted as a necessary breaking change. Follow-on: legacy
graphs with raw blob content may need a migration helper if they create
new checkpoints after upgrading. Add to ROADMAP if reports surface.

### 3. `retrieve()` not implemented as sugar over `retrieveStream()`
**Design:** D1 said "retrieve() becomes sugar: collect retrieveStream()
into a single buffer."
**Actual:** `retrieve()` remains independent — both `CasBlobAdapter` and
`InMemoryBlobStorageAdapter` implement it directly.
**Reason:** Implementation shortcut — the independent path is simpler and
avoids an extra async iteration overhead for the common buffered case.
**Resolution:** Accepted. No functional difference for callers.

### 4. Dynamic import for CasBlobAdapter auto-construction
**Design:** D4 said "auto-constructs CasBlobAdapter internally when
persistence has plumbing."
**Actual:** Uses `await import('../infrastructure/adapters/CasBlobAdapter.js')`
inside an async function — the only domain→infrastructure dynamic import.
**Reason:** No way to statically import from infrastructure in domain
without violating hexagonal architecture. Dynamic import in an async
factory is the least-bad option.
**Resolution:** Accepted. The bridge is isolated in one function
(`autoConstructBlobStorage`), documented, and only fires for Git-backed
persistence.

## What Went Well

- The dev loop (doctrine → spec → semantic → surface) worked cleanly.
  Red-phase tests caught real bugs during implementation (size/mime
  propagation was broken for non-streaming inputs).
- The design doc's 6 decisions mapped directly to implementation steps.
- 5203 tests passing throughout — no regressions.
- The `InMemoryBlobStorageAdapter` placement decision avoided a hexagonal
  architecture violation that would have been the first in the codebase.

## What Could Improve

- The content anchor tree mode change (`100644 blob` → `040000 tree`) was
  not anticipated in the design doc. It should have been a design decision
  (D7) since it's a breaking change affecting commit tree structure.
- The `retrieve()` vs `retrieveStream()` sugar decision should have been
  called out explicitly in the design rather than silently diverged from.
