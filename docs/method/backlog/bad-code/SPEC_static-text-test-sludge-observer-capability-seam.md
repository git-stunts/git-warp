---
id: SPEC_static-text-test-sludge-observer-capability-seam
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/observer-capability-seam.test.ts`

**Effort:** S

This file reads Observer source and asserts import, cast, and state-
reader path text.

Replace it with Observer behavior tests that traverse and read through
the state-reader capability while using a test double that fails on
runtime-class access or broad materialization.
