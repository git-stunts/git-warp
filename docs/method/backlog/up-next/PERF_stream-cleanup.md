---
id: PERF_stream-cleanup
feature: materialization-query-index
blocked_by:
  - PERF_stream-read-migration
  - NDNM_defaultcodec-to-infrastructure
blocks:
  - PERF_stream-memory-tests
---

# Remove per-artifact ports + defaultCodec

**Effort:** M

After write and read paths are migrated to stream pipeline:

- Remove PatchJournalPort, CborPatchJournalAdapter
- Remove CheckpointStorePort, CborCheckpointStoreAdapter
- Remove defaultCodec from all domain files
- Delete defaultCodec.js, canonicalCbor.js
- Expand tripwire to all migrated files

See cycle 0008 design doc.
