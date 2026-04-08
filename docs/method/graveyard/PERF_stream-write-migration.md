# Migrate write paths to stream pipeline

**Effort:** L

First streaming wins — the graph-scale liars:

1. loadPatchRange() → scanPatchRange() returning WarpStream<PatchEntry>
2. index serialize() → yieldShards() through WarpStream pipeline
   (already proven byte-identical for LogicalBitmapIndexBuilder)
3. Collapse CheckpointStorePort micro-methods into
   writeCheckpoint(record) — adapter streams artifacts internally

Keep PatchJournalPort for bounded single-artifact writes. Add
scanRange() for unbounded reads. CheckpointStorePort gets surgery
(collapse, not deletion).

Encode → blobWrite → treeAssemble stays in infrastructure.

See cycle 0008 design doc.

---
**Graveyarded:** 2026-04-08 — completed, shipped before v17.0.0.
