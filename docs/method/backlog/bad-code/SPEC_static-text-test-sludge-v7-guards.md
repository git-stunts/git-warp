---
id: SPEC_static-text-test-sludge-v7-guards
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/v7-guards.test.ts`

**Effort:** S

This file uses file-existence checks to assert legacy schema and engine
files are absent or required files exist.

Keep the public export behavior checks. Replace file-presence guards
with behavioral V7 contract tests that create schema:2 patches and use
the current graph API, plus a separate dead-file scanner if deletion
ratchets still need maintenance enforcement.
