# QueryBuilder.js has 852 LOC and zero dedicated tests

**Effort:** M

## Issue

QueryBuilder.js contains the fluent query API (match, where, outgoing,
incoming, select, aggregate). Its `run()` method is 110 lines and
`_runAggregate` is 61 lines. Zero dedicated test files. All query
testing goes through `WarpGraph.query.test.js` and
`WarpGraph.queryBuilder.test.js` which test via WarpRuntime, not the
builder directly.

## Fix

Create unit tests for QueryBuilder in isolation. Mock the neighbor
provider. Test each clause type, aggregation, edge cases (empty graph,
missing nodes).
