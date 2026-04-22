---
id: PERF_stream-memory-tests
feature: testing-quality
blocked_by:
  - PERF_stream-read-migration
  - PERF_stream-cleanup
blocks: []
---

# Memory-bounded stream witnesses

**Effort:** M

Constrained-heap tests (`--max-old-space-size=64`) proving the stream
architecture is memory-bounded:

1. Build index with 1M nodes via streaming pipeline
2. Materialize graph with 100K patches via patch stream
3. Checkpoint large state via CborStream pipeline

If anything buffers the full dataset, it blows up. The test IS the
architecture proof.

See cycle 0008 design doc.
