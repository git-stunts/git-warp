---
id: SPEC_static-text-test-sludge-warpgraph-factory-closeout
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/warpgraph-factory-closeout.test.ts`

**Effort:** S

This file reads backlog and release-ledger text to assert factory
closeout and shipped history.

Replace it with public `openWarpGraph` behavior tests. Use structured
backlog metadata for historical closeout state rather than prose
assertions.
