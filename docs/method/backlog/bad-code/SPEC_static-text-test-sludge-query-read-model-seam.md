---
id: SPEC_static-text-test-sludge-query-read-model-seam
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/conformance/queryReadModelSeam.test.ts`

**Effort:** S

This file reads query runner, builder, observer, controller, and design
text to assert narrow provider names and forbidden full-graph seams.

Replace source-shape checks with behavioral query tests that use a lazy
read model provider and fail on broad graph materialization or eager
enumeration. Keep only parser-backed architecture gates for import law.
