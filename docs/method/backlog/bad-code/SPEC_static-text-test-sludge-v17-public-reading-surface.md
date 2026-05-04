---
id: SPEC_static-text-test-sludge-v17-public-reading-surface
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/v17-public-reading-surface.test.ts`

**Effort:** S

This file reads public docs and asserts openWarpGraph is framed around
readings rather than graph materialization.

Replace it with public API behavior that opens a graph and performs
optic/query readings without exposing materialize as the primary
contract.
