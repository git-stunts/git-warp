# Migrating to v16

This guide covers the breaking changes in v16.0.0 and how to update your code.

## Content attachments now require blob storage (OG-014)

**What changed:** `attachContent()` and `attachEdgeContent()` no longer fall
back to raw `persistence.writeBlob()`. They always route through
`BlobStoragePort`. Without blob storage, they throw `NO_BLOB_STORAGE`.

**Who is affected:** Only consumers who construct `PatchBuilderV2` directly
(bypassing `WarpRuntime.open()`) without passing `blobStorage`. If you use
`WarpApp.open()`, `WarpCore.open()`, or `WarpRuntime.open()`, blob storage
is auto-constructed — no code changes needed.

**How to migrate:**

```javascript
import InMemoryBlobStorageAdapter from '@git-stunts/git-warp/defaultBlobStorage';

// If you construct PatchBuilderV2 directly, add blobStorage:
const builder = new PatchBuilderV2({
  persistence,
  writerId: 'alice',
  blobStorage: new InMemoryBlobStorageAdapter(), // or CasBlobAdapter for Git
  // ...other options
});
```

## Streaming content I/O

**What changed:** `attachContent()` and `attachEdgeContent()` now accept
streaming input (`AsyncIterable<Uint8Array>`, `ReadableStream<Uint8Array>`)
in addition to `Uint8Array` and `string`. New `getContentStream()` and
`getEdgeContentStream()` methods return `AsyncIterable<Uint8Array>`.

**Who is affected:** No one — this is additive. Existing code continues to
work. New streaming APIs are opt-in.

**How to use:**

```javascript
// Streaming write — pipe a file directly
import { createReadStream } from 'node:fs';
const patch = await app.createPatch();
patch.addNode('doc:1');
await patch.attachContent('doc:1', createReadStream('large-file.bin'), {
  size: fileStat.size,
  mime: 'application/octet-stream',
});
await patch.commit();

// Streaming read — consume incrementally
const stream = await app.getContentStream('doc:1');
if (stream) {
  for await (const chunk of stream) {
    process.stdout.write(chunk);
  }
}

// Buffered read — unchanged
const buf = await app.getContent('doc:1');
```

## Content blob tree entries use tree mode

**What changed:** Patch commit trees and checkpoint trees now reference
content blobs as `040000 tree` entries (CAS tree OIDs) instead of
`100644 blob` entries.

**Who is affected:** Consumers who parse raw Git commit trees and expect
content anchor entries to use blob mode. This does not affect any public
API — it is an internal storage format change.

**How to migrate:** If you parse `_content_<oid>` entries from commit trees,
update your parser to accept `040000 tree` mode.

## `TraversalService` removed

**What changed:** The `TraversalService` export was a deprecated alias for
`CommitDagTraversalService`. It has been removed.

**How to migrate:**

```javascript
// Before
import { TraversalService } from '@git-stunts/git-warp';

// After
import { CommitDagTraversalService } from '@git-stunts/git-warp';
```

## `createWriter()` removed

**What changed:** The `createWriter()` method on `WarpApp` was deprecated in
v15 and has been removed. Use `writer()` instead.

**How to migrate:**

```javascript
// Before
const w = await app.createWriter();
const w2 = await app.createWriter({ persist: 'config', alias: 'secondary' });

// After
const w = await app.writer();          // resolves from git config or generates
const w2 = await app.writer('secondary'); // explicit ID
```
