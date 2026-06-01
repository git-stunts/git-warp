---
id: SPEC_static-text-test-sludge-non-ts-tail-shape
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/non-ts-tail-shape.test.ts`

**Effort:** S

This file scans tracked files and config text to assert the non-TS tail
and stale `.js` glob assumptions.

Replace it with a repository inventory command that reports non-TS
files as data, plus build/typecheck behavior that proves the current
config set actually runs.
