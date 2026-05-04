---
id: SPEC_static-text-test-sludge-query-builder-closeout
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/query-builder-closeout.test.ts`

**Effort:** S

This file reads backlog and release-ledger text to assert stale query
builder god-work items were removed.

Replace it with QueryBuilder behavior tests that prove the current
builder surface works through narrow read models. Use backlog metadata
validation for closeout bookkeeping.
