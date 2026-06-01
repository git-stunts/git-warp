---
id: SPEC_static-text-test-sludge-migrate-warpruntime-test-helper-split
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/migrate-warpruntime-test-helper-split.test.ts`

**Effort:** S

This file reads closeout, downstream, and release-ledger text to assert
the runtime test-helper migration bookkeeping.

Replace it with behavior that uses the migrated helpers in real test
fixtures and proves they no longer depend on the runtime class.
Backlog ordering should be metadata, not prose matching.
