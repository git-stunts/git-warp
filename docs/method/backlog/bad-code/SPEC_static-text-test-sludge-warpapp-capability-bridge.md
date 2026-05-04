---
id: SPEC_static-text-test-sludge-warpapp-capability-bridge
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/warpapp-capability-bridge.test.ts`

**Effort:** S

This file reads WarpApp source text to assert it avoids WarpRuntime and
`callInternalRuntimeMethod` for content reads.

Replace it with WarpApp behavior tests that read content through the
capability bridge using fakes that fail on internal runtime calls.
