# Migrate write paths to stream pipeline

**Effort:** L

Replace PatchJournalPort.writePatch, CheckpointStorePort.writeState,
and all serialize() + codec.encode() patterns with the universal
stream pipeline:

  DomainStream → CborEncodeTransform → GitBlobWriteTransform → TreeAssemblerSink

Covers patches, checkpoints, indexes, provenance/BTR.

See cycle 0008 design doc.
