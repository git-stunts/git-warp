---
id: SPEC_static-text-test-sludge-content-access-duplication-shape
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/content-access-duplication-shape.test.ts`

**Effort:** S

This file reads release ledger and backlog text to assert duplicate
content-access cards were absorbed by a shared seam.

Replace it with behavior that exercises the shared content accessor
from each consumer path. Use backlog metadata tooling for closeout
state.
