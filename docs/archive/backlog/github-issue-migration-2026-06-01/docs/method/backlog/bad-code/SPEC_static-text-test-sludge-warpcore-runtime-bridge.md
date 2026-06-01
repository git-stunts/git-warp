---
id: SPEC_static-text-test-sludge-warpcore-runtime-bridge
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/warpcore-runtime-bridge.test.ts`

**Effort:** S

This file reads WarpCore source to assert it avoids deleted runtime
bridge files, internal runtime calls, and prototype linking.

Replace it with behavior that opens WarpCore through the explicit
product surface and exercises representative reads/writes without the
old bridge.
