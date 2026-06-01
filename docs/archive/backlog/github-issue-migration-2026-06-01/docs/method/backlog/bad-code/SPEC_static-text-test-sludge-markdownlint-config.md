---
id: SPEC_static-text-test-sludge-markdownlint-config
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/markdownlint-config.test.ts`

**Effort:** S

This file reads markdownlint config and asserts exact rule settings as
source text.

Replace it with a config parser test or direct invocation of
markdownlint on representative fixtures, proving the intended behavior
instead of matching config lines.
