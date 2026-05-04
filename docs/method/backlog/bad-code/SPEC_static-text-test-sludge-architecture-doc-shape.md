---
id: SPEC_static-text-test-sludge-architecture-doc-shape
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/architecture-doc-shape.test.ts`

**Effort:** S

This file reads architecture documentation and asserts exact public
surface and noun wording.

Replace it with API behavior and documentation generation checks that
derive examples from executable snippets. Wording-only expectations
should not stand in for runtime contract tests.
