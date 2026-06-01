---
id: SPEC_static-text-test-sludge-warp-drift-release-slotting-shape
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/warp-drift-release-slotting-shape.test.ts`

**Effort:** S

This file reads release horizon and drift ledger text to assert v19,
v20, and v21 slotting.

Replace it with structured backlog metadata validation for release
slotting. Behavioral tests should prove the runtime families as they
land, not test planning prose.
