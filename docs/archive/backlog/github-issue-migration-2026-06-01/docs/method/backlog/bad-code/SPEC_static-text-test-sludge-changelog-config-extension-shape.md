---
id: SPEC_static-text-test-sludge-changelog-config-extension-shape
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/changelog-config-extension-shape.test.ts`

**Effort:** S

This file reads the changelog and asserts it no longer claims a stale
TypeScript config extension shape.

Replace it with release-package behavior that verifies the actual
published config filenames. Changelog wording should be reviewed as
documentation, not tested as executable behavior.
