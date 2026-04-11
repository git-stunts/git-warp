---
id: SLUDGE_factory-functions-in-tests
blocks: []
blocked_by: []
---

# Kill factory sludge in test suite

Factory functions like `createNodeAddV2()`, `createEdgeAddV2()`,
`createPropSetV2()`, `createEventId()`, `createDot()` are one-line
wrappers around constructors. They hide what's actually being
constructed and add zero value.

Files with factory sludge:
- `test/helpers/warpGraphTestUtils.js` — shared exports (root source)
- `test/unit/domain/services/MigrationService.test.js`
- `test/unit/domain/types/ops/factory-integration.test.js`
- `test/unit/domain/types/ops/reducer-integration.test.js`
- `test/benchmark/ReducerV5.benchmark.js`

Also kill `createEventId()` in `src/domain/utils/EventId.ts` and
`createDot()` in `src/domain/crdt/Dot.ts` — use `new EventId()` and
`new Dot()` directly.

JoinReducer.test.js, edgeProps, and integration tests already fixed.
