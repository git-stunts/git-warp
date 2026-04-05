# IndexRebuildService tests check method existence, not correctness

**Effort:** S

## Issue

"loads an index from a tree OID" checks `expect(reader).toBeDefined()`
and `typeof reader.getParents === 'function'` but never calls
`getParents` to verify it returns correct data. "rebuilds the index"
checks `writeBlob` was called but not what was written.

## Fix

Call the reader methods and assert on actual index content. Verify
written blobs contain valid shard data.
