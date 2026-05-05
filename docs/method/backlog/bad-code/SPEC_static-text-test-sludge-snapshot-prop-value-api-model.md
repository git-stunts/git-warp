---
id: SPEC_static-text-test-sludge-snapshot-prop-value-api-model
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/conformance/snapshotPropValueApiModel.test.ts`

**Effort:** S

This file reads snapshot source and public API text to assert class
names, forbidden mutators, and fake immutable representations.

Replace those checks with public snapshot behavior: consumers receive
detached SnapshotPropValue, SnapshotORSet, and SnapshotVersionVector
objects that cannot mutate live CRDT state.
