---
id: SPEC_static-text-test-sludge-warpgraph-runtime-bridge-closeout
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/warpgraph-runtime-bridge-closeout.test.ts`

**Effort:** S

This file reads source, backlog, workload, and release-ledger text to
assert runtime bridge closeout.

Replace it with public factory behavior that opens and operates a graph
without direct runtime-host imports. Keep closeout history in metadata.
