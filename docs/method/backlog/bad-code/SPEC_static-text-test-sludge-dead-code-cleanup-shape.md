---
id: SPEC_static-text-test-sludge-dead-code-cleanup-shape
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/dead-code-cleanup-shape.test.ts`

**Effort:** S

This file reads ledger and backlog prose to assert the dead-code card
was moved to its real owner.

Replace it with a dead-export scanner or reachability report outside
Vitest. Runtime tests should cover the owner behavior that made the
duplicate card unnecessary.
