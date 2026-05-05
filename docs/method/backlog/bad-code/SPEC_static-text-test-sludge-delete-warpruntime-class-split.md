---
id: SPEC_static-text-test-sludge-delete-warpruntime-class-split
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/delete-warpruntime-class-split.test.ts`

**Effort:** S

This file reads source, backlog, and release-ledger text to assert the
old WarpRuntime class and opener residue are deleted.

Replace it with public opener and runtime-host behavior tests that
prove the class surface is no longer needed. Use a dead-file scanner
for deletion ratchets.
