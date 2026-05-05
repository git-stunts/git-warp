---
id: SPEC_static-text-test-sludge-public-api-strand-noun
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/public-api-strand-noun.test.ts`

**Effort:** S

This file reads barrels, docs, and CLI text to assert Strand naming and
legacy selector wording absence.

Replace it with public API and CLI behavior tests that create strands,
use selector flags, and verify StrandError exports. Documentation can
then follow the exercised surface.
