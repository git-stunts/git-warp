---
id: SPEC_static-text-test-sludge-streaming-memory-audit-closeout
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/streaming-memory-audit-closeout.test.ts`

**Effort:** S

This file reads backlog and release-ledger text to assert a streaming
memory audit card was closed while broader work remains elsewhere.

Replace it with behavior or performance-smoke tests that prove the
unbounded blob-read fix is still in place. Let backlog metadata track
which broader work remains live.
