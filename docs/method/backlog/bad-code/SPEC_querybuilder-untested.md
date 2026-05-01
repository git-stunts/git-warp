---
id: SPEC_querybuilder-untested
blocked_by: []
blocks: []
feature: api-capabilities
release_home: v17.0.0
---

# QueryBuilder tests exist but still carry legacy scaffolding sludge

**Effort:** M

## Issue

This card's original state is stale. `QueryBuilder` now has dedicated
coverage through:

- `test/unit/domain/WarpGraph.queryBuilder.test.ts`
- `test/unit/domain/WarpGraph.queryBuilder.compass.test.ts`
- `test/integration/api/querybuilder.test.ts`
- `test/conformance/queryReadModelSeam.test.ts`

The remaining test sludge is different:

- `WarpGraph.queryBuilder.test.ts` still uses pre-existing
  `/** @type {any} */` and `as any` scaffolding.
- The test reaches into runtime private fields such as `_propertyReader`
  and `_logicalIndex`.
- It still has a deterministic `JSON.stringify` assertion.
- Several tests exercise `QueryBuilder` through a runtime graph fixture
  instead of a narrow `QueryReadModelProvider` fixture.

0105 added the narrow provider seam and a conformance test with a fake
lazy provider. The old test file should be brought up to the same
standard instead of remaining a private-runtime fixture corridor.

## Fix

- Replace `any` / `as any` scaffolding with named test fixtures or
  explicit invalid-input helper values.
- Stop mutating private runtime fields from query-builder tests.
- Add provider-level tests around `QueryBuilder` / `QueryRunner` where
  possible instead of routing every case through a full runtime graph.
- Keep integration coverage for the public `graph.query()` path, but do
  not use integration fixtures as a substitute for unit seam coverage.
- Remove or justify the remaining `JSON.stringify` assertion.

Evidence from 0105:

- `test/unit/domain/WarpGraph.queryBuilder.test.ts`
- `test/conformance/queryReadModelSeam.test.ts`
- `docs/design/0105-runtimehost-query-materialization-port-seam.md`
