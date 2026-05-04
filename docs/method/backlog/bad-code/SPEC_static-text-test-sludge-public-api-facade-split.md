---
id: SPEC_static-text-test-sludge-public-api-facade-split
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/public-api-facade-split.test.ts`

**Effort:** S

This file mixes public API import behavior with source and docs text
assertions about WarpApp, WarpCore, and WarpRuntime exports.

Keep the runtime import/type tests. Replace source/doc string checks
with consumer tests that open WarpApp and WarpCore and verify
WarpRuntime is absent from the exported surface.
