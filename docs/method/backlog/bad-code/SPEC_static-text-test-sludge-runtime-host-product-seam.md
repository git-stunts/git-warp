---
id: SPEC_static-text-test-sludge-runtime-host-product-seam
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/runtime-host-product-seam.test.ts`

**Effort:** S

This file reads source text to assert one explicit host-product opener
owns runtime boot and product builders use the shared host seam.

Replace it with behavior that boots products through the opener and
verifies reads/writes reach the expected host capabilities without
calling deleted runtime construction paths.
