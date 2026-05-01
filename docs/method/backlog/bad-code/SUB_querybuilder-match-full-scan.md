---
id: SUB_querybuilder-match-full-scan
blocked_by: []
blocks: []
feature: observer-admission-runtime
release_home: v20.0.0
---

# QueryBuilder match() does a full node scan

**Effort:** M

## Problem

After 0105, `QueryRunner` no longer calls `getNodes()` or depends on a
full node-list contract. That part improved.

The remaining substrate problem is still real: common glob/prefix
queries are backed by scanning live node ids from the state-backed query
read model:

```ts
for (const element of alive.entries.keys()) {
  if (alive.contains(element)) {
    yield element;
  }
}
```

That means `query().match("sym:*")` can still be O(all live nodes)
before any real narrowing happens. The shape is streaming now, not a
full array contract, but the cost model is still full-scan for non-exact
patterns.

The same smell shows up in downstream removal detection when consumers
materialize two ceilings and diff `sym:*` results client-side. The
substrate already computes per-patch op outcomes through `TickReceipt`,
but the query path ignores that cheaper delta surface.

## Why it matters

- Prefix/pattern queries now stream, but they do not yet bound work by
  the number of matches.
- Consumers can accidentally pay two full graph scans to answer
  "what symbols were removed at tick t?"
- This makes query semantics look ergonomic while hiding O(N) behavior
  behind `match()`.

## Suggested direction

- Treat `match()` as a substrate/perf problem, not just a fluent-API
  nicety.
- Add an indexed, prefix-capable, or slice-native query path for common
  id-pattern cases instead of scanning every live node id.
- Keep the 0105 `QueryReadModel` seam; do not regress to full
  materialization or `getNodes()` arrays.
- For removal detection and similar "what changed at tick t?" reads,
  prefer receipt-driven deltas:
  - materialize with `{ receipts: true, ceiling: t }`
  - find the receipt for the target patch/tick
  - filter `NodeTombstone` outcomes whose target matches the symbol
    namespace
  - read props for only those removed ids from the pre-tick observer

This keeps the hot path O(ops in the patch) instead of O(all matching
or all live nodes).

## Evidence

- `src/domain/services/query/QueryRunner.ts`
- `src/domain/services/query/StateQueryReadModel.ts`
- `src/domain/services/controllers/MaterializeController.ts`
- `src/domain/types/TickReceipt.ts`
- `docs/design/0105-runtimehost-query-materialization-port-seam.md`
