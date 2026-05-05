---
id: SPEC_static-text-test-sludge-btr-provenance-boundary
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/conformance/btrProvenanceBoundary.test.ts`

**Effort:** S

This file reads doctrine, design, and source files and asserts exact
text or regex shape for BTR provenance ownership, banned wire names,
and deleted legacy modules.

Replace the source/doc string checks with behavioral provenance tests
that construct and consume BTR records through the public ports. If an
architectural rule still needs a static gate, move it to a named policy
scanner instead of a Vitest behavior suite.
