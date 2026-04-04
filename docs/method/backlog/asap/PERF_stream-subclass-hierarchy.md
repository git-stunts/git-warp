# Artifact record classes + streaming port methods

**Effort:** M

Runtime identity on ELEMENTS, not stream containers. No CborStream
in domain. No marker subclasses of WarpStream.

Artifact records:
- CheckpointArtifact (State | Frontier | AppliedVV) — for checkpoint
  write pipeline
- IndexShard — for index write pipeline
- PatchEntry — for patch scan stream
- ProvenanceEntry — for provenance scan stream

Streaming port methods:
- PatchJournalPort.scanRange() → WarpStream<PatchEntry>
- IndexStorePort.writeShards(WarpStream<IndexShard>) → treeOid
- IndexStorePort.scanShards() → WarpStream<IndexShard>

See cycle 0008 design doc.
