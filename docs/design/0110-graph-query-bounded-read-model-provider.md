# 0110 Graph Query Bounded Read Model Provider

- Status: `RED`
- Release lane: `v17.0.0`
- Source: `v17_graph-query-bounded-read-model-provider`
- Design role: focused release-blocker repair
- Review audience: maintainers and future agents

## Hill

`graph.query()` no longer full-materializes the graph just to answer a
bounded exact-id/id-only query.

## Opening Constraint

```txt
Fix only the default graph query provider path. Do not rewrite
RuntimeHost, materialization, storage, or the query language.
```

## Why This Exists

0109 made the large-graph result concrete:

```txt
graph.query()
  -> QueryController.defaultQueryReadModelProvider()
  -> LiveQueryReadModelProvider.openQueryReadModel()
  -> PatchController._ensureFreshState()
  -> RuntimeHost._materializeGraph()
  -> cached full WarpState
  -> StateQueryReadModel
```

That means v17 can open the fixture, but graph-level query still wears a
streaming API shape over a full-materialization path.

This cycle cuts only that default provider path.

## Scope

In scope:

- `QueryController.defaultQueryReadModelProvider()`.
- The graph-level `graph.query()` provider created by `QueryController`.
- Exact-id/id-only query behavior.
- A bounded read-model provider or equivalent narrow query-owned seam.

Out of scope:

- `RuntimeHost` decomposition.
- Full `materialize()` residency.
- CLI `materialize` checkpoint/write behavior.
- Storage engine redesign.
- Query language redesign.
- Strand overlay materialization.
- Worldline or observer source materialization cleanup.
- Package root exports.
- 0096.
- Pre-commit hook work.

## RED Witness

Focused conformance:

```sh
npx vitest run test/conformance/graphQueryBoundedProvider.test.ts
```

Expected RED:

- The test installs a throwing spy on `_materializeGraph()`.
- It runs `graph.query().match('node:missing').select(['id']).run()`.
- Current production code calls `_materializeGraph()` through the
  default graph query provider, so the test fails.

Observed RED:

```txt
FAIL test/conformance/graphQueryBoundedProvider.test.ts
Error: graph.query exact id-only miss must not full-materialize
```

This RED is intentional. It does not ban `_materializeGraph()` globally.
It bans using `_materializeGraph()` as the graph-level exact-id/id-only
query provider path.

## GREEN Direction

GREEN must make the RED pass without lying.

Acceptable direction:

- Introduce a bounded graph query read-model provider for the default
  `graph.query()` path.
- Preserve public `graph.query()` fluent API behavior.
- Keep `QueryRunner` dependent on `QueryReadModelProvider`.
- Keep `Observer.query()` and `Worldline.query()` public behavior stable.
- Return a deterministic `stateHash` only if it has an honest source.

Hard bans:

- Do not make the RED pass by catching and ignoring
  `_materializeGraph()` failure.
- Do not materialize the full graph under another name.
- Do not introduce `RuntimePort`, `RuntimeFacade`, `GraphPort`,
  `QueryRuntimeManager`, `MaterializationHelper`, or `*Like`.
- Do not turn `LiveQueryReadModelProvider` into a wider host bag.
- Do not rewrite `RuntimeHost`.
- Do not change package exports.

## Release Decision Point

If the provider cannot answer even an exact-id/id-only miss without full
materialization because the required storage/index source does not exist
yet, GREEN is blocked. The correct outcome would be to narrow the v17
release claim to streaming groundwork rather than pretending the
buffering blocker is fixed.

## SLUDGE STRIKER SUMMARY

### 1. Sludge Encountered

- Pattern: graph-level query full-residency path.
  Files: `src/domain/services/controllers/QueryController.ts`,
  `src/domain/services/query/LiveQueryReadModelProvider.ts`,
  `src/domain/services/controllers/PatchController.ts`.
  Why it is sludge: the public `graph.query()` path full-materializes
  before the query read model opens, even for bounded exact-id/id-only
  queries.
  Status: fenced by RED.

### 2. Sludge Fixed

- No production sludge fixed yet.
- Added a focused RED that proves the exact seam instead of opening a
  broad RuntimeHost cleanup.

### 3. Sludge Rejected

- Rejected broad materialization cleanup.
- Rejected storage redesign during RED.
- Rejected query-language redesign.
- Rejected treating 0105's `QueryRunner` streaming shape as sufficient
  proof for the graph-level provider.

### 4. Sludge Deferred / Tracked

- Full `materialize()` residency remains outside this cycle.
- CLI `materialize` disposable-copy Git failure remains outside this
  cycle.
- Observer/worldline source materialization remains outside this cycle.

### 5. Anti-Sludge Checks Actually Run

- Source inspection of `QueryController`, `LiveQueryReadModelProvider`,
  `PatchController`, `QueryRunner`, and existing query conformance tests.
- Branch safety checkpoint and push of 0109 before starting this cycle.
- `npx vitest run test/conformance/graphQueryBoundedProvider.test.ts`
  failed for the intended RED reason.
- `npx eslint test/conformance/graphQueryBoundedProvider.test.ts`
  passed.
- `npx markdownlint
  docs/design/0110-graph-query-bounded-read-model-provider.md` passed.
- `git diff --check` passed.

### 6. Remaining Risk

Remaining risk: the RED may prove that no existing bounded storage/index
source can honestly answer the query. If so, the cycle should stop as
GREEN blocked rather than fake bounded reads.
