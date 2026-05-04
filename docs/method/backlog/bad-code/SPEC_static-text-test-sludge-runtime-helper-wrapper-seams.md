---
id: SPEC_static-text-test-sludge-runtime-helper-wrapper-seams
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/runtime-helper-wrapper-seams.test.ts`

**Effort:** S

This file reads detached graph, patch/state wrapper, and collector
source to assert they avoid WarpRuntime imports and adapter casts.

Replace it with behavior tests that open detached surfaces through
their wrappers and verify capability interactions through fakes. Keep
static import/cast law in policy tooling.
