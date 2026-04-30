# 0105 RuntimeHost Query Read Model Seam

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

Expected model: a query-owned read-model seam:
`QueryReadModelProvider.openQueryReadModel(): Promise<QueryReadModel>`.
No `RuntimeFacade`, no generic `RuntimePort`, no `GraphPort`, no
manager, and no helper landfill.

## PULL Scope

This cycle inspected the query read-model path only. It did not start
RED, implement GREEN, resume 0096, add the anti-sludge hook, change
package exports, or push.

Files inspected:

- `src/domain/services/query/QueryRunner.ts`
- `src/domain/services/query/QueryBuilder.ts`
- `src/domain/services/query/Observer.ts`
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

`Observer.query()` currently constructs:

```ts
new QueryBuilder(this)
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
instead of a query-owned read-model seam.

## What QueryRunner Actually Needs

`QueryRunner` needs a consistent query read model, not a graph-shaped
runtime handle and not the act of materializing one.

```ts
export type QueryReadModel = {
  stateHash: string;
  adjacency: QueryAdjacency;
  getNodes(): Promise<readonly string[]>;
  getNodeProps(nodeId: string): Promise<QueryPropertyBag | null>;
};

export type QueryReadModelProvider = {
  openQueryReadModel(): Promise<QueryReadModel>;
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

`stateHash` should be non-null at this seam. `QueryRunner` immediately
requires a string today, and a query read model without a state hash is
not a valid query read model. Keep `string | null` only if RED proves
null is a real query read-model state rather than a legacy leak from a
broader runtime shape.

## Architectural Ownership

The semantic owner of query execution is the Observer/read perspective,
not `RuntimeHost`.

When a caller queries, the model is:

1. Select a read coordinate, scope, frontier, and aperture.
2. Open a consistent read model for that observer perspective.
3. Traverse the query adjacency projection.
4. Read snapshot property bags.
5. Filter, select, and aggregate.
6. Return a deterministic result tied to `stateHash`.

That is Observer territory. `RuntimeHost` owns live execution, writes,
storage, replay, checkpointing, and materialization machinery. It should
not be the semantic object that `QueryRunner` talks to.

Architectural rule:

- `Observer` owns or provides the query read model.
- `QueryBuilder` is created from an observer/read perspective.
- `QueryRunner` depends on `QueryReadModelProvider`.
- `RuntimeHost`, detached graph paths, and worldline paths may adapt
  themselves into observer-backed read perspectives.
- `graph.query()` is ergonomic sugar, not the semantic owner.

Preferred answer for 0105:

```txt
graph.query() is sugar for the default graph observer/read perspective.
```

Because `QueryCapability.query()` is synchronous today, the default
observer/read perspective may be represented by a lazy
`QueryReadModelProvider` that opens the actual read model during
`QueryRunner.run()`. That preserves public ergonomics without letting
`QueryRunner` depend on a host bag.

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

## Smallest Honest Read-Model Seam

The smallest honest seam is query-owned and read-model specific:

```ts
export type QueryReadModelProvider = {
  openQueryReadModel(): Promise<QueryReadModel>;
};
```

Where `QueryReadModel` owns the facts the runner reads:

```ts
export type QueryReadModel = {
  readonly stateHash: string;
  readonly adjacency: QueryAdjacency;
  getNodes(): Promise<readonly string[]>;
  getNodeProps(nodeId: string): Promise<QueryPropertyBag | null>;
};
```

`QueryAdjacency` should name the adjacency projection used by query
execution. This preserves interface segregation without inventing a
generic runtime facade or graph port.

## Seam Location

The read-model seam should live under the query domain, not under
RuntimeHost:

```txt
src/domain/services/query/QueryReadModel.ts
```

Reason: `QueryRunner` owns the need. RuntimeHost owns one possible
implementation source, but the query package should own the query read
contract.

`QueryRunner.ts` may keep runner-local result types only if they do not
become repeated seam shapes. If `QueryReadModel`, `QueryAdjacency`, or
`QueryPropertyBag` need to be imported by both the read model and runner,
they should move to `QueryReadModel.ts` or to a narrowly named query
value file. Do not create `queryTypes.ts`.

## Implementation Ownership

The semantic implementation owner is the observer/read perspective.
`QueryController` may compose the graph-level sugar, but it should not
make `RuntimeHost` the query source.

Acceptable GREEN shape:

- `Observer` implements or owns the observer-backed
  `QueryReadModelProvider`.
- `Observer.query()` passes that provider to `QueryBuilder`.
- `QueryController.query()` creates a default observer/read perspective
  provider and passes it to `QueryBuilder`.
- `QueryBuilder` stores the narrow `QueryReadModelProvider`.
- `QueryRunner` depends on `QueryReadModelProvider`, not `QueryGraph`.
- `QueryRunner` calls `openQueryReadModel()`, not `_materializeGraph()`.
- `QueryRunner` executes traversal, filtering, selection, and
  aggregation against `QueryReadModel`.
- `Worldline.query()` stays observer/read-perspective centered; if it
  needs adaptation, it must not become a runtime facade.

The adapter may be a small private object literal if it is not repeated.
If it becomes a runtime object with behavior, it must get a precise file
and name. It must not be called `RuntimeFacade`, `RuntimePort`,
`GraphPort`, `QueryRuntimeManager`, or `MaterializationHelper`.

## Constructor Decision

Do not preserve the old `QueryBuilder` constructor for compatibility
theater. Constructors establish invariants and receive required
dependencies explicitly. If `QueryBuilder` needs a narrower dependency
to satisfy DI, then its constructor should change.

Design rules:

- Constructors establish invariants.
- Constructors receive required dependencies explicitly.
- Constructors may throw when given invalid dependencies.
- Do not allow optional, partial, or host-bag dependencies just to avoid
  changing call sites.
- Do not hide dependency changes behind setters, `init()` methods,
  globals, service locators, managers, or facades.

If `QueryBuilder` is exported from the package root, a constructor
change is an intentional public constructor correction, not accidental
drift. The supported construction path for normal consumers remains
`graph.query()`, `observer.query()`, `worldline.query()`, and related
factory methods. Direct `new QueryBuilder(...)` remains possible only
with the explicit query DI dependency object.

RED should verify the constructor does not accept a broad runtime or
host object. GREEN should make invalid construction impossible or fail
immediately.

## Public APIs That Must Not Accidentally Change

0105 must not accidentally change public query behavior or package
exports.

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

The `QueryBuilder` constructor is the exception: it may change if that
is the honest way to require the narrow query read-model provider.

No `index.ts` export change is justified by this PULL.

## RED Plan

RED should prove the seam is currently too broad.

Recommended focused RED:

- Add a conformance test for `QueryRunner.ts` that fails while
  `QueryRunner` references `_materializeGraph`.
- Assert `QueryRunner` does not export or consume a graph shape with
  `_materializeGraph`.
- Assert `QueryRunner` does not require `getEdges`.
- Assert `QueryBuilder` constructor does not accept a broad runtime or
  host object.
- Assert `QueryController.query()` does not pass its broad host directly
  to `QueryBuilder`.
- Assert `Observer.query()` is compatible with the query read-model
  provider seam.
- Assert `graph.query()` remains public sugar and does not become the
  semantic owner of query execution.
- Assert query read model exposes `stateHash: string`, unless the RED
  explicitly proves nullable query state hash is valid.
- Assert a query-owned `QueryReadModelProvider` / `QueryReadModel` seam
  exists.
- Assert banned names do not appear in the new seam:
  `RuntimeFacade`, `RuntimePort`, `GraphPort`, `QueryRuntimeManager`,
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

1. Add the query-owned read-model seam.
2. Replace `QueryGraph` with the narrow `QueryReadModelProvider`.
3. Remove unused `getEdges()` from the runner dependency.
4. Replace the runner boundary call from `_materializeGraph()` to
   `openQueryReadModel()`.
5. Execute the runner against `QueryReadModel`.
6. Make `Observer.query()` construct `QueryBuilder` with an
   observer-backed provider.
7. Make `QueryController.query()` construct `QueryBuilder` through a
   default observer/read-perspective provider, not the broad host.
8. Keep `RuntimeHost._materializeGraph()` unchanged for other current
   seams.
9. Keep public query behavior unchanged.

This is not a RuntimeHost rewrite. It is one pipe cut.

## Out Of Scope

- No `RuntimeHost` mega-rewrite.
- No generic `RuntimePort`.
- No `RuntimeFacade`.
- No `GraphPort`.
- No `QueryRuntimeManager`.
- No `MaterializationHelper` junk drawer.
- No broad host-bag cleanup.
- No mechanical file splitting.
- No 0096 cast-family work.
- No `LogicalTraversal` seam repair.
- No broad `Observer` / `Worldline` materialization repair beyond the
  query read-model provider boundary needed for this seam.
- No `DetachedGraphFactory` redesign.
- No package-root export changes.
- No production edits during PULL.

## Playback Questions

- Does the RED only prove the `QueryRunner` seam, or does it accidentally
  ban other internal materialization seams?
- Does the GREEN remove `_materializeGraph` from `QueryRunner` without
  changing public query behavior?
- Does `QueryBuilder` constructor require the narrow query dependency
  instead of preserving broad host-bag compatibility?
- Does the design keep Observer/read perspective as the semantic owner
  of query execution?
- Is `graph.query()` still sugar rather than a separate graph-owned
  query semantics path?
- Does `QueryReadModel` expose a non-null `stateHash` unless null was
  proven valid?
- Does the new port name describe the query read-model need instead of
  hiding RuntimeHost behind a prettier facade?
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
- Pattern: query ownership bypass.
  Files: `src/domain/services/query/QueryRunner.ts`,
  `src/domain/services/controllers/QueryController.ts`,
  `src/domain/services/query/Observer.ts`.
  Why it is sludge: graph-level query construction can skip the
  observer/read perspective and feed RuntimeHost-shaped dependencies to
  query execution.
  Status: rejected in design.
- Pattern: constructor compatibility theater.
  Files: `src/domain/services/query/QueryBuilder.ts`.
  Why it is sludge: preserving a constructor that accepts a broad
  runtime/host object would hide the real DI dependency.
  Status: rejected in design.
- Pattern: nullable query state hash leak.
  Files: `src/domain/services/query/QueryRunner.ts`.
  Why it is sludge: `QueryRunner` requires a string state hash, so a
  query read model should not advertise null unless null is proven valid
  for queries.
  Status: rejected unless RED proves otherwise.
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
- Rejected broad `GraphPort`.
- Rejected `QueryRuntimeManager`.
- Rejected `MaterializationHelper`.
- Rejected broad RuntimeHost cleanup.
- Rejected package-root export changes.
- Rejected graph-owned query semantics; `graph.query()` is sugar.
- Rejected preserving sloppy constructors to avoid call-site changes.
- Rejected optional dependency bags and init-after-construction patterns.
- Rejected nullable query `stateHash` unless RED proves it is valid.
- Rejected production edits during PULL.

### 4. Sludge Deferred / Tracked

- Other `_materializeGraph` seams remain deferred.
- `LogicalTraversal` still uses a broad traversal graph with unknown
  materialization state.
- Broad `Observer` and `Worldline` materialization repairs remain
  outside this slice.
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
