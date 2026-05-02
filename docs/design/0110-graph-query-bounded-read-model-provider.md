# 0110 Graph Query Bounded Read Model Provider

- Status: `GREEN blocked`
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

## GREEN Blocked Witness

GREEN was attempted only as source and fixture inspection. No production
code was changed.

An honest bounded source exists only for a checkpoint coordinate when
the checkpoint is current. The concrete fixture does have a schema `4`
index-tree checkpoint:

```txt
checkpoint: 45340a46124aac7d3c9b6aba08532f21691bf718
stateHash: f474464f054ca0ab49d119925f5d1670e58b7076d4e2471e060555060b5cc3a6
indexShardCount: 1026
```

But that checkpoint is stale relative to the live writer ref:

```txt
writer: local.jamess-macbook-pro-2.local.cli
checkpoint frontier tip: 17112a1deabdd03250a9fd316871d0b13c8eed58
current writer tip: 45cd79ce492eac71d391a69704917c1c26744fbd
matches: false
```

Therefore a checkpoint-index-backed provider would be honest only for a
checkpoint-scoped read, not for live `graph.query()`.

The current `QueryReadModel` contract also requires synchronous
`stateHash: string` on the read model. For a stale checkpoint plus live
tail, an honest live `stateHash` requires either:

- applying and hashing the tail against the checkpoint state, which
  re-enters full-state residency today; or
- introducing a real incremental live query/checksum source that can
  account for the tail without loading the full state.

Neither source exists in the current implementation. Returning the
checkpoint hash for live `graph.query()` would be a public API lie.
Returning a made-up query-scope hash would also be a public API lie.

Decision: 0110 is GREEN blocked.

The release has two honest options:

1. Add a deeper, explicit live-tail bounded query/checksum substrate
   before claiming the v16 buffering blocker is fixed.
2. Narrow the v17 claim to TypeScript plus streaming/bounded-query
   groundwork, and state that live large-graph query bounded residency
   remains future work.

## SLUDGE STRIKER SUMMARY

### 1. Sludge Encountered

- Pattern: graph-level query full-residency path.
  Files: `src/domain/services/controllers/QueryController.ts`,
  `src/domain/services/query/LiveQueryReadModelProvider.ts`,
  `src/domain/services/controllers/PatchController.ts`.
  Why it is sludge: the public `graph.query()` path full-materializes
  before the query read model opens, even for bounded exact-id/id-only
  queries.
  Status: fenced by RED; GREEN blocked.
- Pattern: stale checkpoint-index temptation.
  Files: `/Users/james/.think/codex`, `src/domain/services/state/checkpointLoad.ts`,
  `src/domain/services/MaterializedViewService.ts`.
  Why it is sludge: the fixture has an index-tree checkpoint, but the
  live writer ref is ahead of the checkpoint frontier. Using the
  checkpoint index for live `graph.query()` would ignore the tail.
  Status: rejected.
- Pattern: fake `stateHash` pressure.
  Files: `src/domain/services/query/QueryReadModelProvider.ts`.
  Why it is sludge: the read model requires `stateHash: string`; a
  bounded live provider cannot honestly populate that for a stale
  checkpoint without a real live-tail checksum source.
  Status: rejected.

### 2. Sludge Fixed

- No production sludge fixed yet.
- Added a focused RED that proves the exact seam instead of opening a
  broad RuntimeHost cleanup.
- Added a GREEN-blocked witness that prevents a partial empty-graph fix
  from being mistaken for the large-graph buffering repair.

### 3. Sludge Rejected

- Rejected broad materialization cleanup.
- Rejected storage redesign during RED.
- Rejected query-language redesign.
- Rejected treating 0105's `QueryRunner` streaming shape as sufficient
  proof for the graph-level provider.
- Rejected returning a checkpoint `stateHash` for a live query when the
  checkpoint frontier is stale.
- Rejected inventing a query-scope hash to satisfy the test shape.
- Rejected passing the RED only for empty graphs while the concrete
  fixture still lacks an honest live bounded source.

### 4. Sludge Deferred / Tracked

- Full `materialize()` residency remains outside this cycle.
- CLI `materialize` disposable-copy Git failure remains outside this
  cycle.
- Observer/worldline source materialization remains outside this cycle.
- Live-tail bounded query and checksum substrate remains the real
  blocker if v17 keeps the full buffering-fix claim.

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
- Inspected checkpoint metadata for `/Users/james/.think/codex` without
  loading checkpoint `state.cbor`.
- Confirmed fixture checkpoint schema `4` has index shards.
- Confirmed fixture checkpoint frontier does not match the live writer
  ref.

### 6. Remaining Risk

Remaining risk: v17 still cannot honestly claim live large-graph
bounded-residency `graph.query()` behavior. The exact next blocker is no
longer the default provider alone; it is the absence of an honest
live-tail bounded query/checksum source behind that provider.
