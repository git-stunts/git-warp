---
id: SPEC_static-text-test-sludge-warpruntime-suite-migration
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/warpruntime-suite-migration.test.ts`

**Effort:** S

This file scans runtime-facing suites and asserts they no longer use
the runtime class.

Replace it with migrated suite behavior that opens the supported graph
or host products directly. Use static import policy only as a separate
maintenance scanner.
