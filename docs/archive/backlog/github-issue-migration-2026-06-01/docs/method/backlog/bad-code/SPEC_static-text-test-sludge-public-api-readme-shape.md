---
id: SPEC_static-text-test-sludge-public-api-readme-shape
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/public-api-readme-shape.test.ts`

**Effort:** S

This file reads README prose and asserts evaluator-facing fit tables,
Git substrate wording, stack maps, and handoff text.

Replace it with package smoke tests and executable README examples that
prove the evaluator-facing claims. README wording should be reviewed
or generated from those examples, not line-matched.
