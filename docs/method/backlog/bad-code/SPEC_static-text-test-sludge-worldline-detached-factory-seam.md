---
id: SPEC_static-text-test-sludge-worldline-detached-factory-seam
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/worldline-detached-factory-seam.test.ts`

**Effort:** S

This file reads detached worldline factory source and asserts it avoids
WarpRuntime imports, direct detached-open logic, and observer casts.

Replace it with behavior that opens detached worldlines through the
factory seam and proves observer/read capabilities work without the old
runtime or cast corridor.
