---
id: SPEC_static-text-test-sludge-openwarpruntime-bridge-closeout
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/openwarpruntime-bridge-closeout.test.ts`

**Effort:** S

This file reads bridge source to assert it avoids WarpRuntime imports
and `openWarpRuntime` calls.

Replace it with behavior that constructs the runtime bridge through
the supported host opener and proves the old bridge path is not needed.
Use import policy tooling for static import law.
