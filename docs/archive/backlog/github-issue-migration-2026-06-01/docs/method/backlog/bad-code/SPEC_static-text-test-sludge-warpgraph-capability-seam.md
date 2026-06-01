---
id: SPEC_static-text-test-sludge-warpgraph-capability-seam
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/warpgraph-capability-seam.test.ts`

**Effort:** S

This file reads WarpGraph source and docs to assert direct runtime
imports, `_runtime`, casts, and sync teaching are absent.

Replace it with WarpGraph behavior tests that perform sync and reads
through the capability bag while proving no public `_runtime` escape
hatch is exposed.
