# 0105 RuntimeHost Query Read Model Seam Retrospective

- Outcome: `hill met for focused QueryRunner read-model seam`
- Cycle doc:
  [docs/design/0105-runtimehost-query-materialization-port-seam.md](../../design/0105-runtimehost-query-materialization-port-seam.md)
- Release lane: `v17.0.0`

## Outcome

0105 is hill met for the focused `QueryRunner` read-model seam.

The cycle removed `QueryRunner`'s dependency on runtime materialization
and replaced it with a query-owned `QueryReadModelProvider` /
`QueryReadModel` seam. `QueryRunner` now consumes node, neighbor, and
property reads through the query read model rather than depending on
`RuntimeHost`, `_materializeGraph`, a full adjacency map, or a full
node-list contract.

This does not mean the whole codebase is cursor-native or holographic.
The deeper storage, traversal, observer, worldline, and RuntimeHost
materialization seams remain separate work.

## What Went Well

- RED was corrected to reject both bad names and fake streaming
  behavior.
- The behavioral conformance test proved bounded exact-match id-only
  queries do not drain the lazy node stream.
- `QueryRunner` now depends on `QueryReadModelProvider`, not a broad
  graph-shaped host.
- `QueryBuilder` constructor now requires the explicit DI dependency.
- `Observer` remains the semantic read-perspective owner.
- `QueryController.query()` now composes graph-level sugar through a
  default observer/read-perspective provider.
- No package-root exports changed.
- No RuntimeHost rewrite, generic facade, manager, helper landfill,
  0096 work, or hook work was introduced.

## What Went Wrong

- The PULL began as a design-only seam, then expanded into RED/GREEN
  once approved. The design doc needed closeout cleanup so the hill
  matched the actual cycle.
- The first RED was too source-shape-oriented and had to be corrected to
  catch stream cosplay.
- The seam touched more files than a tiny patch because `graph.query()`,
  `observer.query()`, and `worldline.query()` all needed to preserve
  public behavior while routing through the narrower dependency.
- Existing traversal files still contain broad materialization and
  `unknown` / `Record<string, unknown>` sludge outside the slice.
- The legacy query-builder unit test still contains pre-existing
  `any` / `as any` scaffolding outside the fixed seam.

## What Changed From Original Plan

- The target abstraction changed from materialization-flavored language
  to query-owned read-model language.
- Observer/read perspective became the explicit semantic owner.
- `QueryBuilder` constructor compatibility was rejected in favor of
  honest DI.
- The RED added a behavioral lazy-provider test to prove bounded stream
  consumption.
- `QueryAggregation` was extracted to keep `QueryRunner` below the
  source file-size ceiling after the seam change.

## Follow-Up Handling

No new backlog cards were created in this retrospective.

Known follow-up:

- Other `_materializeGraph` seams remain outside 0105.
- `LogicalTraversal` still has broad traversal/materialization coupling.
- `TraversalContext.ts` and `traversalHelpers.ts` still contain existing
  boundary/modeling sludge.
- Broader RuntimeHost host-bag sludge remains tracked by the 0104 survey
  and should be attacked one seam at a time.
- The query-builder unit test's old `any` scaffolding remains separate
  test sludge.

## Recommendation For Next Cycle

Recommendation: stop here for the day, or pull one narrow follow-up seam
only after a fresh PULL.

If continuing soon, prefer one of:

1. Another single RuntimeHost/controller seam chosen from the 0104
   survey.
2. A focused `LogicalTraversal` read-model seam, because it still has
   broad materialization and `unknown` boundary residue.
3. A test-sludge slice for the legacy query-builder unit test scaffolding
   if test honesty is the priority.

Do not resume broad 0096 or broad RuntimeHost cleanup without a new
bounded PULL.

## SLUDGE STRIKER SUMMARY

### 1. Sludge Encountered

- Pattern: query runner runtime-materialization coupling.
  Files: `src/domain/services/query/QueryRunner.ts`.
  Why it was sludge: query execution depended on internal runtime
  materialization instead of an observer/read-model seam.
  Status: fixed.
- Pattern: fake streaming risk.
  Files: `test/conformance/queryReadModelSeam.test.ts`.
  Why it was sludge: source-shape checks alone could allow a full
  materialized graph wrapped in `AsyncIterable`.
  Status: fixed by behavioral RED.
- Pattern: constructor compatibility theater.
  Files: `src/domain/services/query/QueryBuilder.ts`.
  Why it was sludge: preserving broad construction would hide the real
  dependency.
  Status: rejected.
- Pattern: stale cycle wording.
  Files: `docs/design/0105-runtimehost-query-materialization-port-seam.md`.
  Why it was sludge: the doc still described a design-only hill after
  RED/GREEN implementation was authorized.
  Status: fixed during closeout.

### 2. Sludge Fixed

- Replaced `QueryRunner.QueryGraph` with `QueryReadModelProvider`.
- Replaced `_materializeGraph()` in `QueryRunner` with
  `openQueryReadModel()`.
- Replaced full-adjacency traversal dependency with `neighbors(...)`.
- Replaced full node-list query initialization with `nodes(...)`.
- Replaced broad `QueryBuilder` construction with explicit DI.
- Replaced stale design-only closeout language with hill-met closeout
  language.

### 3. Sludge Rejected

- Rejected `RuntimePort`, `RuntimeFacade`, `GraphPort`,
  `QueryRuntimeManager`, and `MaterializationHelper`.
- Rejected package-root export changes.
- Rejected fake streaming.
- Rejected broad RuntimeHost cleanup.
- Rejected broad 0096 work.
- Rejected hook work in this cycle.

### 4. Sludge Deferred / Tracked

- Other runtime materialization seams remain deferred.
- `LogicalTraversal` remains a likely next seam.
- Existing traversal helper `unknown` / `Record<string, unknown>` sludge
  remains outside this slice.
- Legacy query-builder test scaffolding remains outside this slice.

### 5. Anti-Sludge Checks Actually Run

- `npx vitest run test/conformance/queryReadModelSeam.test.ts`
  passed during GREEN.
- Targeted query/controller tests passed during GREEN.
- `npm run typecheck` passed during GREEN.
- `npm run lint:sludge` passed during GREEN.
- ESLint, markdownlint, manual policy scan, and `git diff --check`
  passed during GREEN.

### 6. Remaining Risk

Remaining risk: 0105 repaired the query runner seam only. The codebase
still has broader RuntimeHost, traversal, observer/worldline, and storage
materialization sludge that must be handled as separate narrow cycles.
