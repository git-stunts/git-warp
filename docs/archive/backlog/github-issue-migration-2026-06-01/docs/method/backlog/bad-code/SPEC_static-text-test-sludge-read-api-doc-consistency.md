---
id: SPEC_static-text-test-sludge-read-api-doc-consistency
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/read-api-doc-consistency.test.ts`

**Effort:** S

This file reads public read-surface docs and asserts where examples,
pinning details, runtime caveats, and legacy nouns appear or do not
appear.

Replace it with executable read examples that run through Worldline,
Observer, and deeper runtime-read scenarios. Use docs generation or
linting for placement, not behavior tests.
