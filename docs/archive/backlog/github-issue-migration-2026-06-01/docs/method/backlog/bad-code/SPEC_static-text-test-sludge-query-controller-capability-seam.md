---
id: SPEC_static-text-test-sludge-query-controller-capability-seam
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/query-controller-capability-seam.test.ts`

**Effort:** S

This file reads query controller source and asserts it avoids direct
WarpRuntime imports, detached helper calls, and cast corridors.

Replace it with behavior tests using fake query/read capabilities that
fail on runtime-class access. Static import rules belong in policy
tooling.
