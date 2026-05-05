---
id: SPEC_static-text-test-sludge-release-policy-shape
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/release-policy-shape.test.ts`

**Effort:** S

This file reads package metadata, roadmap, release docs, README, and
packed artifact config to assert release-policy wording and shape.

Replace it with release preflight commands that actually pack, inspect,
and smoke the artifacts. Keep policy prose as documentation backed by
those commands.
