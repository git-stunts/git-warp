# 0105 RuntimeHost Query Materialization Port Seam

- Status: `PULL`
- Release lane: `v17.0.0`
- Source: `SLUDGE_runtimehost-controller-port-seam-one`
- Design role: narrow seam extraction design
- Review audience: maintainers and future agents

## Hill

Design the first narrow `RuntimeHost`/controller seam extraction without
editing production code.

Preferred seam:

```txt
QueryRunner / _materializeGraph
```

Expected model: a narrow `QueryMaterializationPort` or equivalent
explicit seam. No `RuntimeFacade`, no generic `RuntimePort`, no manager,
and no helper landfill.

## PULL Scope

This cycle inspected the query materialization path only. It did not
start RED, implement GREEN, resume 0096, add the anti-sludge hook,
change package exports, or push.

Files inspected:

- `src/domain/services/query/QueryRunner.ts`
- `src/domain/services/query/QueryBuilder.ts`
- `src/domain/services/query/LogicalTraversal.ts`
- `src/domain/services/controllers/QueryController.ts`
- `src/domain/services/controllers/QueryReads.ts`
- `src/domain/services/controllers/ReadGraphHost.ts`
- `src/domain/RuntimeHost.ts`
- `src/domain/capabilities/DetachedGraphFactory.ts`
- `src/domain/warp/RuntimeHostProduct.ts`
- `src/domain/capabilities/QueryCapability.ts`
- `test/unit/domain/services/controllers/QueryController.test.ts`
- `test/unit/scripts/query-controller-capability-seam.test.ts`
- `test/unit/domain/WarpGraph.queryBuilder.test.ts`
- `test/integration/api/querybuilder.test.ts`
- `docs/design/0104-sludge-sleuth-screening-and-survey.md`

## Current Call Path

`RuntimeHost.query()` delegates to `QueryController.query()`.

`QueryController.query()` currently constructs:

```ts
new QueryBuilder(host(this))
```

`QueryBuilder.run()` currently constructs:

```ts
new QueryRunner(this._graph)
```

`QueryRunner.run()` currently calls:

```ts
this._graph._materializeGraph()
```

That means the query runner depends on a private-ish runtime method name
instead of a query-owned materialization seam.

## What QueryRunner Actually Needs

`QueryRunner` needs exactly these read capabilities:

```ts
type QueryMaterializedGraph = {
  adjacency: AdjacencyMaps;
  stateHash: string | null;
};

type QueryExecutionSource = {
  materializeForQuery(): Promise<QueryMaterializedGraph>;
  getNodes(): Promise<string[]>;
  getNodeProps(nodeId: string): Promise<QueryPropertyBag | null>;
};
```

`QueryRunner` does not use:

- `getEdges()`
- `hasNode()`
- content methods
- observer/worldline methods
- `WarpState`
- `RuntimeHost`
- `_cachedState`
- `_persistence`
- `_materializedGraph`
- `_ensureFreshState`

The current `QueryGraph` shape is therefore too broad and contains the
wrong materialization name.

## Current Dependency Sludge

The current seam is sludge for three reasons.

First, `_materializeGraph` is an internal runtime method. Exposing it in
`QueryRunner.QueryGraph` makes private RuntimeHost behavior look like a
normal query dependency.

Second, `QueryGraph` includes `getEdges()` even though `QueryRunner`
does not use it. That is interface-segregation drift.

Third, the same hidden runtime materialization concept appears in
multiple structural shapes:

- `QueryRunner.QueryGraph`
- `QueryController.MaterializableHost`
- `RuntimeHostProduct`
- `DetachedGraphInternalMaterializationSurface`
- `LogicalTraversal.TraversalGraph`

0105 must only fix the `QueryRunner` seam. The other seams are real, but
they are out of scope for this slice.

## Smallest Honest Port

The smallest honest port is query-owned and materialization-specific:

```ts
export type QueryMaterializationPort = {
  materializeForQuery(): Promise<QueryMaterializedGraph>;
};
```

`QueryRunner` also needs node reads, but those are not the hidden
RuntimeHost materialization seam. The least-sludge implementation path
is:

```ts
export type QueryExecutionSource =
  QueryMaterializationPort &
  QueryNodeReadSource;
```

Where `QueryNodeReadSource` is limited to:

```ts
export type QueryNodeReadSource = {
  getNodes(): Promise<string[]>;
  getNodeProps(nodeId: string): Promise<QueryPropertyBag | null>;
};
```

This preserves interface segregation without inventing a generic runtime
facade.

## Port Location

The port should live under the query domain, not under RuntimeHost:

```txt
src/domain/services/query/QueryMaterializationPort.ts
```

Reason: `QueryRunner` owns the need. RuntimeHost owns one possible
implementation source, but the query package should own the query
materialization contract.

`QueryRunner.ts` may keep runner-local result types only if they do not
become repeated seam shapes. If `QueryMaterializedGraph`,
`QueryAdjacencyMaps`, or `QueryPropertyBag` need to be imported by both
the port and runner, they should move to the port file or to a narrowly
named query value file. Do not create `queryTypes.ts`.

## Implementation Ownership

The implementation should be composed at `QueryController`, because
`QueryController.query()` is the boundary that creates `QueryBuilder`.

Acceptable GREEN shape:

- `QueryController` adapts its private `MaterializableHost` to the
  query-owned source.
- `QueryBuilder` stores the narrow query execution source.
- `QueryRunner` depends on `QueryExecutionSource`, not `QueryGraph`.
- `QueryRunner` calls `materializeForQuery()`, not `_materializeGraph()`.

The adapter may be a small private object literal if it is not repeated.
If it becomes a runtime object with behavior, it must get a precise file
and name. It must not be called `RuntimeFacade`, `RuntimePort`,
`QueryRuntimeManager`, or `MaterializationHelper`.

## Public APIs That Must Not Change

0105 must not change public query behavior or package exports.

These surfaces must remain stable:

- `QueryCapability.query(): QueryBuilder`
- `QueryBuilder.match()`
- `QueryBuilder.where()`
- `QueryBuilder.outgoing()`
- `QueryBuilder.incoming()`
- `QueryBuilder.select()`
- `QueryBuilder.aggregate()`
- `QueryBuilder.run()`
- `WarpCore.query()`
- `Worldline.query()`
- `Observer.query()`
- package-root `index.ts`

No `index.ts` export change is justified by this PULL.

## RED Plan

RED should prove the seam is currently too broad.

Recommended focused RED:

- Add a conformance test for `QueryRunner.ts` that fails while
  `QueryRunner` references `_materializeGraph`.
- Assert `QueryRunner` does not export or consume a graph shape with
  `_materializeGraph`.
- Assert `QueryRunner` does not require `getEdges`.
- Assert a query-owned `QueryMaterializationPort` or equivalent named
  seam exists.
- Assert banned names do not appear in the new seam:
  `RuntimeFacade`, `RuntimePort`, `QueryRuntimeManager`,
  `MaterializationHelper`, and `Like`.

Runtime behavior tests should still run after GREEN:

- `test/unit/domain/WarpGraph.queryBuilder.test.ts`
- `test/unit/domain/WarpGraph.queryBuilder.compass.test.ts`
- `test/integration/api/querybuilder.test.ts`
- `test/unit/domain/services/controllers/QueryController.test.ts`

The RED may use source inspection for the seam boundary, but GREEN must
also keep query runtime behavior passing. Do not let source regex become
the architecture.

## GREEN Plan

GREEN should make the smallest seam change:

1. Add the query-owned materialization port.
2. Replace `QueryGraph` with the narrow query execution source.
3. Remove unused `getEdges()` from the runner dependency.
4. Rename the materialization call from `_materializeGraph()` to
   `materializeForQuery()` at the runner boundary.
5. Compose the adapter in `QueryController.query()`.
6. Keep `RuntimeHost._materializeGraph()` unchanged for other current
   seams.
7. Keep public query behavior unchanged.

This is not a RuntimeHost rewrite. It is one pipe cut.

## Out Of Scope

- No `RuntimeHost` mega-rewrite.
- No generic `RuntimePort`.
- No `RuntimeFacade`.
- No `QueryRuntimeManager`.
- No `MaterializationHelper` junk drawer.
- No broad host-bag cleanup.
- No mechanical file splitting.
- No 0096 cast-family work.
- No `LogicalTraversal` seam repair.
- No `Observer` / `Worldline` materialization repair.
- No `DetachedGraphFactory` redesign.
- No package-root export changes.
- No production edits during PULL.

## Playback Questions

- Does the RED only prove the `QueryRunner` seam, or does it accidentally
  ban other internal materialization seams?
- Does the GREEN remove `_materializeGraph` from `QueryRunner` without
  changing public query behavior?
- Does the new port name describe the query materialization need instead
  of hiding RuntimeHost behind a prettier facade?
- Did any adapter object gain more than one reason to change?
- Did any public API or package export widen without a demonstrated
  public reason?

## Validation

Required validation for this PULL-only doc:

```sh
npx markdownlint docs/design/0105-runtimehost-query-materialization-port-seam.md
git diff --check
```

## SLUDGE STRIKER SUMMARY

### 1. Sludge Encountered

- Pattern: underscore runtime materialization seam in query runner.
  Files: `src/domain/services/query/QueryRunner.ts`.
  Why it is sludge: `QueryRunner` calls `_materializeGraph`, making an
  internal RuntimeHost method part of the query execution contract.
  Status: designed, not fixed.
- Pattern: over-broad query runner dependency.
  Files: `src/domain/services/query/QueryRunner.ts`.
  Why it is sludge: `QueryGraph` includes `getEdges()` even though the
  runner does not use it.
  Status: designed, not fixed.
- Pattern: repeated hidden materialization shapes.
  Files: `QueryRunner.ts`, `QueryController.ts`,
  `DetachedGraphFactory.ts`, `RuntimeHostProduct.ts`,
  `LogicalTraversal.ts`.
  Why it is sludge: multiple structural shapes expose runtime
  materialization with private-ish names.
  Status: only the QueryRunner seam is in scope.

### 2. Sludge Fixed

No production sludge was fixed. This PULL only names the first seam and
the smallest honest design target.

### 3. Sludge Rejected

- Rejected `RuntimeFacade`.
- Rejected generic `RuntimePort`.
- Rejected `QueryRuntimeManager`.
- Rejected `MaterializationHelper`.
- Rejected broad RuntimeHost cleanup.
- Rejected package-root export changes.
- Rejected production edits during PULL.

### 4. Sludge Deferred / Tracked

- Other `_materializeGraph` seams remain deferred.
- `LogicalTraversal` still uses a broad traversal graph with unknown
  materialization state.
- `Observer` and `Worldline` materialization seams remain outside this
  slice.
- Broader RuntimeHost host-bag sludge remains tracked by the 0104 survey
  and existing backlog cards.

### 5. Anti-Sludge Checks Actually Run

PULL inspection commands read the named source, test, and design files.
Validation commands are recorded by the final turn after this document is
linted.

### 6. Remaining Risk

Remaining risk: this is only a PULL design. The hidden RuntimeHost seam
still exists in production code until a later RED/GREEN cycle removes it
from `QueryRunner`.
