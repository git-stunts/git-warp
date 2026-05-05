---
id: SPEC_static-text-test-sludge-backlog-debt-release-home
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/backlog-debt-release-home.test.ts`

**Effort:** S

This file scans backlog markdown and README text for `release_home`
metadata and hard-coded count rows.

Replace it with a structured backlog metadata validator that emits the
counts as data. Keep process invariants executable without asserting
specific prose in a Vitest suite.
