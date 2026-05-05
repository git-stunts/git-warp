---
id: SPEC_static-text-test-sludge-pre-push-hook
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/pre-push-hook.test.ts`

**Effort:** S

This file has useful hook execution tests, but it also reads the
checked-in hook text and asserts header layout.

Keep the quick-mode, missing-launcher, and normal-mode behavior tests.
Replace header text matching with executing the hook against fixture
commands and verifying the observed gate sequence.
