---
id: IDX_property-reader-capability-port
blocked_by:
  - ARCH_sludge-atlas-and-refactor-guide
blocks:
  - 0096-purge-cast-hacks
feature: materialized-index
release_home: v17.0.0
---

# PropertyIndexReader impersonates a larger storage port

**Effort:** M

## What's Wrong

`PropertyIndexReader` only needs `readBlob`, but callers currently cast
small objects to `IndexStoragePort`, a much larger capability surface.

The code even says "only `readBlob` is called at runtime." That is a
port modeling failure. If the dependency is read-only property-shard
blob access, the architecture should name that capability directly.

## Why This Matters

Large-port impersonation hides dependency edges. It makes tests and
callers pretend they provide write/tree/ref behavior when the domain
read path only needs a blob reader.

## Suggested Fix

- Split the capability only after naming the real architectural seam.
- Prefer a precise capability such as `PropertyShardBlobReaderPort` if
  that is the durable concept.
- Do not introduce a tiny port merely to appease TypeScript; connect it
  to the materialized-index architecture.

## Acceptance

- No object with only `readBlob` is cast to `IndexStoragePort`.
- `PropertyIndexReader` depends on the narrowest real capability.
- Materialized view loading and tests use the same honest capability.
