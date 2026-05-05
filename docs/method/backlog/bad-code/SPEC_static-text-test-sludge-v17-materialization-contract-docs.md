---
id: SPEC_static-text-test-sludge-v17-materialization-contract-docs
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/v17-materialization-contract-docs.test.ts`

**Effort:** S

This file reads public documentation and asserts it does not describe
materialization as the v17 read contract.

Replace it with public read-surface behavior tests that prove v17 users
read through optics, readings, worldlines, and observers. Documentation
can then be corrected without becoming a behavior proxy.
