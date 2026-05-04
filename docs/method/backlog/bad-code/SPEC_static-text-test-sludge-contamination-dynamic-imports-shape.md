---
id: SPEC_static-text-test-sludge-contamination-dynamic-imports-shape
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/contamination-dynamic-imports-shape.test.ts`

**Effort:** S

This file reads scanner, semgrep, docs, and source text to assert
dynamic-import contamination rules and carve-outs.

Replace it with parser-backed policy tests for dynamic imports plus
runtime adapter-loader behavior tests that prove the sanctioned carve-
out works without leaking platform imports into core.
