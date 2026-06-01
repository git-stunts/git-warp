---
id: SPEC_static-text-test-sludge-openwarpgraph-composition-root
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/openwarpgraph-composition-root.test.ts`

**Effort:** S

This file reads source text to assert public graph boot routes through
the shared host seam and avoids deleted runtime imports/static opens.

Replace it with behavior that opens a graph through the public factory
and verifies the injected host product handles reads and writes without
the runtime class surface.
