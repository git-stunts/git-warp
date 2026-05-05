---
id: SPEC_static-text-test-sludge-documentation-corpus-shape
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/documentation-corpus-shape.test.ts`

**Effort:** S

This file reads documentation files and directory structure to assert
indexing, guide placement, archive placement, and clutter removal.

Replace it with a docs build or link-check command that validates the
documentation graph structurally. Product behavior should be covered
by executable examples, not doc layout string tests.
