---
id: SPEC_static-text-test-sludge-immutable-snapshot-builder
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/conformance/immutableSnapshotBuilder.test.ts`

**Effort:** S

This file includes source-text checks for clone/freeze artifacts
alongside real immutable snapshot behavior tests.

Drop the source-string artifact assertions and keep expanding behavior:
unsupported instances reject, supported snapshot types are detached,
and returned arrays/bytes cannot mutate stored state.
