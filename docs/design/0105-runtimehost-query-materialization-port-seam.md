# 0105 RuntimeHost Query Read Model Seam

- Status: `GREEN`
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

`QueryRunner` needs a consistent, bounded query read model, not a
graph-shaped runtime handle, not a full adjacency map, and not the act of
materializing a whole graph.

```ts
export type QueryReadModel = {
  readonly stateHash: string;
  nodes(request: QueryNodeStreamRequest): AsyncIterable<QueryNodeSnapshot>;
  neighbors(
    nodeId: string,
    options?: QueryNeighborOptions,
  ): AsyncIterable<QueryNeighborEntry>;
  nodeProps(nodeId: string): Promise<QueryPropertyBag | null>;
};

export type QueryReadModelProvider = {
  openQueryReadModel(): Promise<QueryReadModel>;
};
```

`QueryRunner` does not use:

- `getEdges()`
- `hasNode()`
- full `getNodes(): Promise<string[]>` as its primary query source
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

The read model must support huge graph and holographic read paths. A
`QueryReadModel` that simply exposes full adjacency residency is
`_materializeGraph()` with a better name.

Streaming cannot be cosmetic. A `QueryReadModel` implementation must not
satisfy the contract by first materializing a full graph, full adjacency
map, or full node list and then yielding from it.

## Architectural Ownership

The semantic owner of query execution is the Observer/read perspective,
not `RuntimeHost`.

When a caller queries, the model is:

1. Select a read coordinate, scope, frontier, and aperture.
2. Open a bounded read model for that observer perspective.
3. Traverse through cursor, slice, or streaming neighbor reads.
4. Read snapshot property bags on demand.
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
  nodes(request: QueryNodeStreamRequest): AsyncIterable<QueryNodeSnapshot>;
  neighbors(
    nodeId: string,
    options?: QueryNeighborOptions,
  ): AsyncIterable<QueryNeighborEntry>;
  nodeProps(nodeId: string): Promise<QueryPropertyBag | null>;
};
```

This preserves interface segregation without inventing a generic runtime
facade or graph port.

No full graph materialization assumption:

- no `QueryMaterializedGraph`;
- no `adjacency: AdjacencyMaps` as the query contract;
- no `fullAdjacency`;
- no `getEdges(): Promise<...>` on the query read model;
- no full `getNodes(): Promise<string[]>` as the primary query source;
- no `materializeForQuery`;
- no `Promise<QueryMaterializedGraph>`.

The exact request/entry names may evolve, but the semantics must remain
streaming, cursor-shaped, sliced, or otherwise bounded.

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
become repeated seam shapes. If `QueryReadModel`, query stream requests,
neighbor entries, or `QueryPropertyBag` need to be imported by both the
read model and runner, they should move to `QueryReadModel.ts` or to a
narrowly named query value file. Do not create `queryTypes.ts`.

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
- `QueryRunner` consumes `AsyncIterable` node and neighbor streams
  rather than full node arrays or full adjacency maps.
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
- Assert the query read model is streaming, cursor-shaped, sliced, or
  otherwise bounded.
- Assert `QueryRunner` can consume a lazy `QueryReadModelProvider`
  without draining a bounded node stream.
- Assert the query seam does not expose `QueryMaterializedGraph`,
  `adjacency: AdjacencyMaps`, `fullAdjacency`,
  `getEdges(): Promise<...>`, full `getNodes(): Promise<string[]>` as
  the primary query source, `materializeForQuery`, or
  `Promise<QueryMaterializedGraph>`.
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

## RED Witness

RED test:

```txt
test/conformance/queryReadModelSeam.test.ts
```

The RED is intentionally scoped to the query seam:

- It rejects `_materializeGraph` in `QueryRunner`.
- It does not ban `_materializeGraph` in `RuntimeHost` or other internal
  seams.
- It rejects `QueryRunner.QueryGraph` and unused `getEdges` as runner
  dependencies.
- It requires `QueryReadModelProvider` / `QueryReadModel`.
- It rejects full-graph-shaped query models such as
  `QueryMaterializedGraph`, `adjacency: AdjacencyMaps`,
  `fullAdjacency`, `getEdges(): Promise<...>`, full
  `getNodes(): Promise<string[]>` as the primary query source,
  `materializeForQuery`, and `Promise<QueryMaterializedGraph>`.
- It requires streaming/cursor/slice-shaped read semantics through
  `AsyncIterable`, `nodes(...)`, `neighbors(...)`, and
  `nodeProps(...)` or equivalent.
- It adds a behavioral RED with a fake lazy `QueryReadModelProvider`.
  The fake throws on full materialization, full node-list reads, full
  edge-list reads, node-prop reads for an id-only query, and stream
  draining beyond the first exact-match node.
- It rejects `QueryBuilder` construction from a broad `QueryGraph`.
- It rejects `QueryController.query()` passing `host(this)` directly to
  `QueryBuilder`.
- It rejects `Observer.query()` passing the whole `Observer` as the
  runner dependency if the observer has not exposed the narrow read-model
  provider seam.
- It preserves the PULL decision that `graph.query()` is sugar and
  Observer/read perspective is the semantic owner.
- It rejects god-seam names: `RuntimePort`, `RuntimeFacade`,
  `GraphPort`, `QueryRuntimeManager`, and `MaterializationHelper`.

Expected current result: the test fails. That is correct because
production still has `QueryRunner` calling `_materializeGraph()` through
the broad `QueryGraph` shape.

RED validation result:

- `npx vitest run test/conformance/queryReadModelSeam.test.ts` failed
  as expected.
- Failure count: 8 failed, 2 passed.
- The failures prove current production still has:
  - `QueryRunner` referencing `_materializeGraph`;
  - no query-owned `QueryReadModelProvider` seam in `QueryRunner`;
  - full-graph-shaped query model assumptions such as
    `QueryMaterializedGraph`, `adjacency: AdjacencyMaps`, and full
    `getNodes(): Promise<string[]>`;
  - no bounded streaming/cursor-shaped read model seam;
  - no behavioral support for a lazy read model whose bounded exact-match
    query does not fully drain the node stream;
  - `QueryBuilder` constructed from `QueryGraph`;
  - `QueryController.query()` passing `host(this)` directly to
    `QueryBuilder`;
  - `Observer.query()` passing the whole `Observer` to `QueryBuilder`.
- `npx eslint test/conformance/queryReadModelSeam.test.ts` passed.
- `npx markdownlint
  docs/design/0105-runtimehost-query-materialization-port-seam.md`
  passed.
- `git diff --check` passed.

## GREEN Plan

GREEN should make the smallest seam change:

1. Add the query-owned read-model seam.
2. Replace `QueryGraph` with the narrow `QueryReadModelProvider`.
3. Remove unused `getEdges()` from the runner dependency.
4. Replace the runner boundary call from `_materializeGraph()` to
   `openQueryReadModel()`.
5. Execute the runner against `QueryReadModel`.
6. Consume node and neighbor reads through streaming/cursor/slice-shaped
   read-model methods.
7. Make `Observer.query()` construct `QueryBuilder` with an
   observer-backed provider.
8. Make `QueryController.query()` construct `QueryBuilder` through a
   default observer/read-perspective provider, not the broad host.
9. Keep `RuntimeHost._materializeGraph()` unchanged for other current
   seams.
10. Keep public query behavior unchanged.

This is not a RuntimeHost rewrite. It is one pipe cut.

## GREEN Witness

Implementation summary:

- Added the query-owned `QueryReadModelProvider` / `QueryReadModel`
  seam under `src/domain/services/query/`.
- Replaced `QueryRunner.QueryGraph` with the narrow
  `QueryReadModelProvider` constructor dependency.
- `QueryRunner` no longer calls `_materializeGraph`, no longer accepts a
  graph-shaped host, no longer depends on `getEdges()`, and no longer
  requires a full adjacency map or full node list as its contract.
- `QueryRunner` consumes `nodes(...)`, `neighbors(...)`, and
  `nodeProps(...)` from the read model and explicitly supports bounded
  lazy node-stream consumption for exact-match id-only queries.
- Added a state-backed query read model that streams from live OR-Set
  entries and resolves neighbors/properties on demand without building
  a full adjacency map for the query runner.
- `Observer` remains the semantic read-perspective owner. Its
  `query()` path constructs `QueryBuilder` through
  `queryReadModelProvider()` rather than passing the whole observer as
  the runner dependency.
- `QueryController.query()` now builds graph-level sugar through a
  default observer/read-perspective provider instead of passing
  `host(this)` directly to `QueryBuilder`.
- `Worldline.query()` delegates through the observer-backed read model
  provider seam.
- No `RuntimeHost` rewrite, package-root export change, generic
  `RuntimePort`, `RuntimeFacade`, `GraphPort`, manager, helper landfill,
  0096 work, or hook work was introduced.

Public API notes:

- `graph.query()`, `observer.query()`, `worldline.query()`, and
  `QueryBuilder` fluent methods remain public behavior.
- Direct `new QueryBuilder(...)` now requires an explicit
  `QueryReadModelProvider` dependency. This is an intentional DI
  correction: constructors establish required dependencies.
- No package-root exports were added for the internal query read-model
  seam.

Boundary note:

0105 removes the full-materialization assumption from `QueryRunner`.
It does not claim the storage layer is fully holographic yet. The live
provider still opens a read model from the current runtime state source;
the important GREEN boundary is that query execution no longer depends
on a full graph/adjacency/node-list contract and can consume a lazy read
model without draining it for bounded queries.

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
- No production edits outside the query read-model seam.

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
- Does `QueryReadModel` avoid full graph materialization and full
  adjacency residency as its contract?
- Can the seam support huge graph, streaming, sliced, or holographic
  read paths?
- Does the new port name describe the query read-model need instead of
  hiding RuntimeHost behind a prettier facade?
- Did any adapter object gain more than one reason to change?
- Did any public API or package export widen without a demonstrated
  public reason?

## Validation

Required validation for GREEN:

```sh
npx vitest run test/conformance/queryReadModelSeam.test.ts
npx vitest run test/unit/domain/WarpGraph.queryBuilder.test.ts test/unit/domain/WarpGraph.queryBuilder.compass.test.ts test/integration/api/querybuilder.test.ts test/unit/domain/services/controllers/QueryController.test.ts
npm run typecheck
npm run lint:sludge
npx eslint src/domain/services/query/QueryRunner.ts src/domain/services/query/QueryBuilder.ts src/domain/services/query/Observer.ts src/domain/services/controllers/QueryController.ts test/conformance/queryReadModelSeam.test.ts
npx eslint src/domain/services/query/QueryReadModelProvider.ts src/domain/services/query/StateQueryReadModel.ts src/domain/services/query/LiveQueryReadModelProvider.ts src/domain/services/query/QueryAggregation.ts src/domain/services/Worldline.ts
rg -n "as unknown as|as any|\\bany\\b|\\bunknown\\b|Record<string, unknown>|\\bFunction\\b|Readonly<Uint8Array>|ReadonlySet|globalThis\\.Set|Object\\.create|\\bProxy\\b|JSON\\.parse|JSON\\.stringify|[A-Za-z0-9_]+Like\\b" \
  src/domain/services/query/QueryRunner.ts \
  src/domain/services/query/QueryBuilder.ts \
  src/domain/services/query/Observer.ts \
  src/domain/services/query/QueryReadModelProvider.ts \
  src/domain/services/query/StateQueryReadModel.ts \
  src/domain/services/query/LiveQueryReadModelProvider.ts \
  src/domain/services/query/QueryAggregation.ts \
  src/domain/services/controllers/QueryController.ts \
  src/domain/services/Worldline.ts \
  test/conformance/queryReadModelSeam.test.ts
npx markdownlint docs/design/0105-runtimehost-query-materialization-port-seam.md
git diff --check
```

GREEN validation result:

- `npx vitest run test/conformance/queryReadModelSeam.test.ts` passed.
- Targeted query/controller runtime tests passed.
- `npm run typecheck` passed.
- `npm run lint:sludge` passed.
- ESLint passed for the required seam files and new read-model files.
- Manual policy scan of changed production seam and conformance files
  found no checked banned-pattern matches.
- A broader scan of `src/domain/services/query` still finds existing
  traversal sludge in `LogicalTraversal.ts`, `TraversalContext.ts`, and
  `traversalHelpers.ts`; that is deferred and not claimed clean by 0105.
- `npx markdownlint
  docs/design/0105-runtimehost-query-materialization-port-seam.md`
  passed.
- `git diff --check` passed.

## SLUDGE STRIKER SUMMARY

### 1. Sludge Encountered

- Pattern: underscore runtime materialization seam in query runner.
  Files: `src/domain/services/query/QueryRunner.ts`.
  Why it is sludge: `QueryRunner` calls `_materializeGraph`, making an
  internal RuntimeHost method part of the query execution contract.
  Status: fixed.
- Pattern: over-broad query runner dependency.
  Files: `src/domain/services/query/QueryRunner.ts`.
  Why it is sludge: `QueryGraph` includes `getEdges()` even though the
  runner does not use it.
  Status: fixed.
- Pattern: query ownership bypass.
  Files: `src/domain/services/query/QueryRunner.ts`,
  `src/domain/services/controllers/QueryController.ts`,
  `src/domain/services/query/Observer.ts`.
  Why it is sludge: graph-level query construction can skip the
  observer/read perspective and feed RuntimeHost-shaped dependencies to
  query execution.
  Status: fixed for `QueryRunner`; other RuntimeHost materialization
  seams remain out of scope.
- Pattern: renamed full-materialization seam.
  Files: `src/domain/services/query/QueryRunner.ts`.
  Why it is sludge: returning a full adjacency map or full node list
  from `openQueryReadModel()` would preserve `_materializeGraph()`
  semantics behind a better name.
  Status: rejected by RED.
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

- Replaced `QueryRunner.QueryGraph` with `QueryReadModelProvider`.
- Replaced `QueryRunner` `_materializeGraph()` dependency with
  `openQueryReadModel()`.
- Replaced query runner full-adjacency traversal with on-demand
  `neighbors(...)`.
- Replaced full node-list query runner initialization with
  `nodes(...)` streaming consumption.
- Replaced `QueryController.query()` passing `host(this)` into
  `QueryBuilder` with default Observer/read-perspective sugar.
- Replaced `Observer.query()` passing the whole observer directly into
  `QueryBuilder` with the narrow provider-returning seam.

### 3. Sludge Rejected

- Rejected `RuntimeFacade`.
- Rejected generic `RuntimePort`.
- Rejected broad `GraphPort`.
- Rejected `QueryRuntimeManager`.
- Rejected `MaterializationHelper`.
- Rejected broad RuntimeHost cleanup.
- Rejected package-root export changes.
- Rejected graph-owned query semantics; `graph.query()` is sugar.
- Rejected `QueryMaterializedGraph` as the query read-model contract.
- Rejected full adjacency residency as the query contract.
- Rejected full node-list reads as the primary query source.
- Rejected `materializeForQuery`.
- Rejected preserving sloppy constructors to avoid call-site changes.
- Rejected optional dependency bags and init-after-construction patterns.
- Rejected nullable query `stateHash` unless RED proves it is valid.
- Rejected production edits during PULL.

### 4. Sludge Deferred / Tracked

- Other `_materializeGraph` seams remain deferred.
- `LogicalTraversal` still uses a broad traversal graph with unknown
  materialization state.
- `TraversalContext.ts` and `traversalHelpers.ts` still contain
  `unknown` / `Record<string, unknown>` traversal boundary checks.
- Broad `Observer` and `Worldline` materialization repairs remain
  outside this slice.
- `test/unit/domain/WarpGraph.queryBuilder.test.ts` still contains
  pre-existing `any` / `as any` test scaffolding and one deterministic
  `JSON.stringify` assertion; 0105 changed only stale clone fallback
  expectations in that file.
- Broader RuntimeHost host-bag sludge remains tracked by the 0104 survey
  and existing backlog cards.

### 5. Anti-Sludge Checks Actually Run

- `npx vitest run test/conformance/queryReadModelSeam.test.ts`
  passed.
- `npx vitest run test/unit/domain/WarpGraph.queryBuilder.test.ts
  test/unit/domain/WarpGraph.queryBuilder.compass.test.ts
  test/integration/api/querybuilder.test.ts
  test/unit/domain/services/controllers/QueryController.test.ts`
  passed.
- `npm run typecheck` passed.
- `npm run lint:sludge` passed.
- ESLint passed for the touched query seam files, new read-model files,
  `Worldline.ts`, `QueryController.ts`, and the conformance RED file.
- Manual policy scan of changed production seam and conformance files
  found no checked banned-pattern matches.
- `npx markdownlint
  docs/design/0105-runtimehost-query-materialization-port-seam.md`
  passed.
- `git diff --check` passed.

### 6. Remaining Risk

Remaining risk: 0105 removes the RuntimeHost/full-materialization
contract from `QueryRunner`, but deeper storage and traversal layers
still contain broad materialization seams. The live query provider opens
from the current runtime state source; it is not yet proof that every
storage path is holographic or cursor-native.
