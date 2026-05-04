---
id: SPEC_static-text-test-sludge-warpruntime-helper-migration
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/warpruntime-helper-migration.test.ts`

**Effort:** S

This file reads helper and docs source to assert seed/helper openers
and helper docs stay off the runtime class.

Replace it with behavior that creates seeded test graphs through the
migrated helpers and verifies docs examples use the same public helper
surface.
