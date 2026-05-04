---
id: SPEC_static-text-test-sludge-capability-consumer-migration-closeout
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/capability-consumer-migration-closeout.test.ts`

**Effort:** S

This file reads migration notes and release ledgers to assert that
consumer migration prose is marked satisfied.

Replace it with behavioral consumer-surface tests that instantiate the
migrated capability consumers. Ledger closeout should be a structured
metadata check, not a string-shape test.
