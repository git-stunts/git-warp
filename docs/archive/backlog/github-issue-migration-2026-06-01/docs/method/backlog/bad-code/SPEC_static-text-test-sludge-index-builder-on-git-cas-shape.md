---
id: SPEC_static-text-test-sludge-index-builder-on-git-cas-shape
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/index-builder-on-git-cas-shape.test.ts`

**Effort:** S

This file reads design and release-ledger text to assert git-cas and
bounded-residency framing.

Replace it with index-builder behavior tests that stream shards through
the git-cas port without whole-graph residency. Documentation framing
should be generated from or reviewed against those examples.
