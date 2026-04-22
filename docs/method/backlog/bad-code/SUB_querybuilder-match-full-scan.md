---
id: SUB_querybuilder-match-full-scan
blocked_by: []
blocks: []
feature: observer-admission-runtime
---

# QueryBuilder match() does a full node scan

**Effort:** M

## Problem

`src/domain/services/query/QueryRunner.ts` currently implements
`match()` by materializing the full node id set and filtering it in
memory:

- `const allNodes = sortIds(await this._graph.getNodes());`
- `const matched = allNodes.filter((id) => matchGlob(pattern, id));`

That means `query().match("sym:*")` is O(all live nodes) before any
real narrowing happens. For symbol-heavy clients, this turns
prefix-style lookups into full `nodeAlive` scans and makes query cost
scale with total graph size, not with the number of matching symbols.

The same smell shows up in downstream removal detection when consumers
materialize two ceilings and diff `sym:*` results client-side. The
substrate already computes per-patch op outcomes through `TickReceipt`,
but the query path ignores that cheaper delta surface.

## Why it matters

- Prefix/pattern queries do not stream and do not bound residency by
  the number of matches.
- Consumers can accidentally pay two full graph scans to answer
  "what symbols were removed at tick t?"
- This makes query semantics look ergonomic while hiding O(N) behavior
  behind `match()`.

## Suggested direction

- Treat `match()` as a substrate/perf problem, not just a fluent-API
  nicety.
- Add a streaming/prefix-capable query path for common id-pattern
  cases instead of `getNodes()` + in-memory glob filtering.
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
- `src/domain/services/controllers/MaterializeController.ts`
- `src/domain/types/TickReceipt.ts`
