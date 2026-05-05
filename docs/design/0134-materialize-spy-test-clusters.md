# 0134 Materialize Spy Test Clusters

- Status: `Final`
- Date: 2026-05-05
- Release lane: `v17.0.0`
- Source task: `SPEC_materialize-spy-test-clusters`
- DAG source: [0124-v17-release-blocker-dag.md](0124-v17-release-blocker-dag.md)

## Hill

The remaining stale materialize-spy and auto-materialize unit tests stop
asserting hidden replay, private cache shape, or automatic materialized
state creation. They instead pin the v17 reading-basis contract:
direct cached-state reads require an existing fresh reading basis,
explicit substrate materialization can create that basis in internal
tests, and write helpers do not secretly create it.

## User Stories

- As a release reviewer, I can run the former materialize-spy clusters
  without failures caused by retired auto-materialize expectations.
- As an app developer, stale unit tests no longer imply that v17 direct
  reads will call materialize for me.
- As a maintainer, adjacency/cache tests assert visible read behavior
  instead of call counts on private `_buildAdjacency()` or
  `_materializedGraph`.
- As a maintainer, `patchMany()` tests distinguish sequential write
  behavior from read-basis creation.

## Requirements

- Do not change production query, runtime, patch, or materialization
  logic in this cycle unless a behavioral test proves a real product bug.
- Rewrite stale tests in the failing materialize-spy cluster to assert
  public or behavioral outcomes.
- Keep direct read failures machine-checkable through `QueryError` codes
  rather than legacy "No materialized state" text.
- Preserve tests proving explicit substrate materialization still creates
  a usable cached reading basis in internal unit coverage.
- Do not introduce source-text tests, line-count tests, or tests that
  inspect test files.

## Acceptance Criteria

- Focused former materialize-spy cluster tests pass.
- The rewritten tests no longer assert `graph.materialize()` call counts,
  `_materializeGraph()` calls, `_buildAdjacency()` calls, or
  `_materializedGraph` private shape as the behavior under test.
- `npm run test:local` has fewer failures and no remaining failures from
  the rewritten materialize-spy files.
- `CHANGELOG.md` records the test-contract cleanup.
- DAG status marks `SPEC_materialize-spy-test-clusters` complete and
  regenerates the SVG.

## Test Plan

### RED

- `npm run test:local` currently fails 15 files / 62 tests.
- The stale cluster includes:
  - `WarpGraph.lazyMaterialize.test.ts`
  - `WarpGraph.adjacencyCache.test.ts`
  - `WarpGraph.autoMaterializeRemove.test.ts`
  - `WarpGraph.errorCodes.test.ts`
  - `WarpGraph.seekDiff.test.ts`
  - `WarpGraph.patchMany.test.ts`
  - `WarpGraph.coverageGaps.test.ts`
- Focused RED command:

```sh
npx vitest run \
  test/unit/domain/WarpGraph.lazyMaterialize.test.ts \
  test/unit/domain/WarpGraph.adjacencyCache.test.ts \
  test/unit/domain/WarpGraph.autoMaterializeRemove.test.ts \
  test/unit/domain/WarpGraph.errorCodes.test.ts \
  test/unit/domain/WarpGraph.seekDiff.test.ts \
  test/unit/domain/WarpGraph.patchMany.test.ts \
  test/unit/domain/WarpGraph.coverageGaps.test.ts
```

### Goldens

- Direct cached-state read methods reject with `E_NO_STATE` when no
  reading basis exists.
- Direct cached-state read methods reject with `E_STALE_STATE` when the
  cached basis is marked stale.
- Direct cached-state read methods work after explicit internal
  materialization creates a basis.
- `createPatch().removeNode()` and `removeEdge()` require a basis so
  observed dots are real.
- `patchMany()` returns sequential commit SHAs but does not create a
  read basis for callback reads.
- Repeated neighbor reads over a clean explicit basis remain stable.

### Known Fails Outside This Cycle

- Observer coordinate pinning remains owned by
  `SPEC_observer-coordinate-pinning`.
- Checkpoint/materialize incremental expectations remain outside this
  test-contract cleanup.
- Sync security hardening remains under the `HEX_sync-*` nodes.

### Stress / Jitter

- No cached basis, clean cached basis, and stale cached basis.
- Node reads, edge reads, property reads, neighbor reads, query builder,
  traversal, and state snapshot.
- Remove operations with and without explicit basis.
- `patchMany()` success, sequential callbacks, and callback failure.

## RED Evidence

Focused RED command:

```sh
npx vitest run \
  test/unit/domain/WarpGraph.lazyMaterialize.test.ts \
  test/unit/domain/WarpGraph.adjacencyCache.test.ts \
  test/unit/domain/WarpGraph.autoMaterializeRemove.test.ts \
  test/unit/domain/WarpGraph.errorCodes.test.ts \
  test/unit/domain/WarpGraph.seekDiff.test.ts \
  test/unit/domain/WarpGraph.patchMany.test.ts \
  test/unit/domain/WarpGraph.coverageGaps.test.ts
```

Initial result: 7 failed files, 46 failed tests, and 99 passing tests.
The failures were stale expectations around automatic materialization,
private adjacency/cache call counts, and legacy "No materialized state"
error text.

## GREEN Changes

- Replaced the old lazy-materialize suite with v17 direct read
  reading-basis tests.
- Replaced adjacency cache spy tests with repeated neighbor-read behavior
  over explicit cached bases.
- Updated remove tests so node and edge removes require an explicit
  basis and then work after one exists.
- Updated error-code and state-snapshot tests so `autoMaterialize` does
  not mask `E_NO_STATE` or `E_STALE_STATE`.
- Updated `patchMany()` tests so commit sequencing remains covered
  without implying that callbacks get an implicit read basis.
- Updated coverage-gap assertions to use the v17 reading-basis message
  and machine-readable error code.

## Validation

- Focused former materialize-spy cluster passed: 7 files, 113 tests.
- `npm run lint` passed.
- `npm run lint:sludge` passed.
- `npm run typecheck` passed.
- `npm run typecheck:consumer` passed.
- `npm run lint:md` passed.
- `npm run lint:md:code` passed.
- `npm audit --omit=dev --audit-level=high` passed with 0
  vulnerabilities.
- `git diff --check` passed.
- `npm run test:local` remains red outside this cycle: 8 failed files,
  16 failed tests, and 6,741 passing tests. Remaining failures map to
  `SPEC_observer-coordinate-pinning` and old checkpoint/materialize
  incremental expectations.

## Playback Answers

1. No. Rewritten tests no longer assert materialization call counts or
   private materialized graph shape.
2. Yes. Direct reads now assert `E_NO_STATE` / `E_STALE_STATE` instead
   of hidden auto-materialization.
3. Yes. Explicit internal materialization tests still prove substrate
   cached reads work once a basis exists.
4. Yes. The focused cluster passes.
5. Yes. Full `test:local` dropped from 15 failed files / 62 failed tests
   to 8 failed files / 16 failed tests.

## Playback Questions

1. Do any rewritten tests still assert private materialization call
   counts or private cache shape?
2. Do direct read tests now assert v17 reading-basis errors instead of
   hidden auto-materialization?
3. Do explicit-basis tests still prove internal substrate reads work?
4. Did focused materialize-spy cluster tests go green?
5. Did `npm run test:local` shed this cluster from the remaining reds?

## Non-Goals

- Do not remove the `autoMaterialize` configuration surface in this
  cycle.
- Do not redesign `WarpCore` direct read APIs.
- Do not fix observer coordinate pinning.
- Do not repair old checkpoint incremental materialization tests.
