---
id: SPEC_static-text-test-sludge-runtime-controller-host-types
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/runtime-controller-host-types.test.ts`

**Effort:** S

This file reads controller and strand source to assert they avoid
WarpRuntime imports, indexed access, and host adapter casts.

Replace it with controller behavior tests that construct the host seams
with strict fakes and prove fork reopening and strand coordination work
without the runtime class.
