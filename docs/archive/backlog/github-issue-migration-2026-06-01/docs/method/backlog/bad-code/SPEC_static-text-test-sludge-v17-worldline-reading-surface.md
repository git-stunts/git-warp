---
id: SPEC_static-text-test-sludge-v17-worldline-reading-surface
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/v17-worldline-reading-surface.test.ts`

**Effort:** S

This file reads public source text to assert Worldline does not expose
a public `materialize` read path.

Replace it with consumer/runtime behavior that obtains a Worldline,
performs observer/read operations, and proves neither `materialize` nor
`_materializeGraph` is present on the public object.
