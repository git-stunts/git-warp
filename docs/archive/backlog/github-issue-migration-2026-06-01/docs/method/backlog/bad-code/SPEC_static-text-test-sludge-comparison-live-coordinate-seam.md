---
id: SPEC_static-text-test-sludge-comparison-live-coordinate-seam
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/conformance/comparisonLiveCoordinateSeam.test.ts`

**Effort:** S

This file reads comparison selector source and design text to assert
specific seam names, import absences, and scoped wording.

Replace those checks with behavioral selector tests using narrow fake
readers that fail if a broad host is asked for data. Static import-law
checks belong in a parser-backed architecture gate, not line-text tests.
