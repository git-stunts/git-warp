---
id: PERF_stream-read-migration
blocked_by: []
blocks: []
---

# Migrate read paths + unbounded scans to streams

**Effort:** L

- Unbounded reads become AsyncIterable: scanPatches() → PatchStream,
  scanIndexShards() → IndexShardStream
- Bounded single-artifact reads stay Promise<T>
- Index readers decode via CborDecodeTransform pipeline
- Naming audit: rename slurp APIs to collect*() (poison pill)

See cycle 0008 design doc.
