# 0122 V17 Branch Safety Checkpoint

- Status: `checkpoint complete`
- Date: 2026-05-04
- Local time: Mon May 4 13:46:35 PDT 2026
- Branch: `release/v17.0.0`
- Head at checkpoint start: `ab853349 docs: Add v17 audit reports`
- Remote base: `origin/release/v17.0.0` at `312e09ef`

## Hill

Establish current branch truth before more code changes:

- branch safety state
- full local gate baseline
- focused post-0105 witness baseline
- which May 4 audit findings remain real after 0105
- whether the branch is safe to push or continue

## Branch Safety

| Check | Result |
|-------|--------|
| Working tree before this checkpoint doc | Clean |
| Tracking state | `release/v17.0.0...origin/release/v17.0.0 [ahead 19]` |
| Behind remote | 0 commits |
| Ahead of remote | 19 commits |
| Diff from remote | 278 files, 6985 insertions, 3015 deletions |
| Push readiness | Not release-ready; do not push as a release candidate |

`docs/BEARING.md` says the handoff had 35 local commits ahead and latest
closeout commit `5068468c`. Local Git truth is newer/different: the
0105 closeout commits are already contained in `origin/release/v17.0.0`,
and this checkout is now 19 commits ahead of that remote tip.

## Latest 20 Commits

```text
ab853349 docs: Add v17 audit reports
2209d3a5 docs: Log static text test sludge backlog
98cfc27e test: Prefer runtime read surface assertions
b6cbebc5 fix: Move traversal off materialized graph seams
fa5b22f9 fix: Build live observers without materialization
837ac26c fix: Remove Worldline materialize read path
e27eaabb fix: Remove materialize from WarpGraph public surface
8f7bceb7 fix: Align materialization docs with snapshot contract
13da229a refactor: Graduate conflict target fake model
585056fa refactor: Split warp graph test helpers
b8f313be fix: Tighten v17 migration script hygiene
c776fd67 fix: Smoke packed npm artifact
2a99f303 docs: Fix config extension changelog note
83526245 fix: Reject malformed seek ticks
ea360c03 docs: Add de-duped Gemini review findings
e6fa22ae docs: Record v17 self-review blockers
5a1f8cc7 fix: resolve release hygiene review blockers
dab3e616 docs(release): define v17 main landing gate
069fb6d3 test(optics): pin non-index checkpoint basis context
312e09ef test(optics): pin missing index shard basis context
```

## Cycle State

| Cycle | Local Design Status | Checkpoint Read |
|-------|---------------------|-----------------|
| 0102 snapshot prop-value API model | `hill met` | Closed. |
| 0103 consumer typecheck suite repair | `hill met` | Closed, but current consumer gate has new/stale materialize residue. |
| 0104 sludge sleuth screening and survey | `hill met` | Closed; findings remain useful as seam inventory. |
| 0105 RuntimeHost query materialization port seam | `hill met` | QueryRunner seam landed, but one post-0105 conformance witness is red in this checkout. |

## Full Gate Baseline

| Gate | Result | Evidence |
|------|--------|----------|
| `npm run lint` | PASS | ESLint exited 0. |
| `npm run typecheck` | PASS | Source and test TypeScript checks exited 0. |
| `npm run typecheck:consumer` | FAIL | `test/type-check/consumer.ts(318,64): Property 'materialize' does not exist on type 'WarpGraph'.` |
| `npm run test:local` | FAIL | 14 failed files, 32 failed tests, 419 passed files, 6741 passed tests. |
| `npm run lint:md` | PASS | Markdown lint exited 0. |
| `npm run lint:md:code` | PASS | Markdown code sample lint passed: 932 Markdown files checked. |
| `npm audit --omit=dev --audit-level=high` | PASS | `found 0 vulnerabilities`. |

## Focused Post-0105 Witnesses

| Witness | Result | Evidence |
|---------|--------|----------|
| `npx vitest run test/conformance/graphQueryBoundedProvider.test.ts` | FAIL | Exact id-only miss trips the `_materializeGraph` trap: `graph.query exact id-only miss must not full-materialize`. |
| `npx vitest run test/unit/domain/services/controllers/QueryController.test.ts` | PASS | 68 tests passed. |
| `npx vitest run test/unit/domain/WarpGraph.queryBuilder.test.ts` | PASS | 22 tests passed. |

## Failed Test Clusters

| Cluster | Files | Read |
|---------|-------|------|
| Checkpoint schema drift | `CheckpointService.test.ts`, `CheckpointService.edgeCases.test.ts` | Still real. Schema:5 fixtures are rejected while schema:2/3/4 legacy fixtures load when tests expect rejection. |
| Controller materialization seams | `PatchController.test.ts`, `SyncController.test.ts`, `CheckpointController.test.ts`, `SubscriptionController.test.ts` | Still real. Controller paths still call `_materializeGraph()` or tests still expect old materialize behavior. |
| Public materialize test residue | `WarpGraph.lazyMaterialize.test.ts`, `WarpGraph.errorCodes.test.ts`, `WarpGraph.watch.test.ts`, `WarpGraph.adjacencyCache.test.ts` | Still real as stale test contract or not-yet-migrated behavior. |
| Observer coordinate pinning | `WarpGraph.observerBoundary.test.ts`, `WarpGraph.strands.test.ts` | Still real behavior risk: observer state hash / pinned read coordinate expectations are red. |
| Release script source-text drift | `uniform-git-cas-closeout.test.ts` | Still real as brittle/stale package upgrade text assertion. |

## Materialization Residue Snapshot

Targeted residue scan:

```text
rg -n "graph\.materialize|graph\.materialize\.materialize|_materializeGraph|Call materialize\(" README.md docs test/type-check src/domain
```

Important disallowed hits remain:

| Surface | Evidence |
|---------|----------|
| README onboarding | `README.md:38` still calls `graph.materialize.materialize({})`. |
| Getting Started | `docs/GETTING_STARTED.md:94` still calls `graph.materialize.materialize({})`. |
| API/Guide public docs | `docs/API_REFERENCE.md`, `docs/GUIDE.md`, and architecture docs still mention `graph.materialize` as public read/folding surface. |
| Consumer type surface | `test/type-check/consumer.ts:315`, `:317`, and `:483` still reference `graph.materialize()`. |
| Runtime error guidance | `QueryStateMessages.ts` and `ProvenanceController.ts` still say "Call materialize". |
| QueryController | `QueryController.ts:58`, `:75`, and `:125` still require/call `_materializeGraph`. |
| SyncController | `SyncController.ts:335` and `:358` still call `_materializeGraph`. |
| Patch/Checkpoint/Subscription controllers | Host contracts and implementation paths still name `_materializeGraph`. |
| RuntimeHost | `RuntimeHost.ts:429` still defines `_materializeGraph()`. |

## Truth Matrix

| Finding | Post-0105 Truth | Evidence |
|---------|-----------------|----------|
| Public `WarpGraph` materialize should be gone | Fixed in public type, but stale docs/tests remain | `WarpGraph` no longer exposes materialize; `typecheck:consumer` fails because tests still expect it. |
| README materialize quick start | Still real | `README.md:38`. |
| Getting Started materialize read path | Still real | `docs/GETTING_STARTED.md:94`. |
| Consumer type materialize residue | Still real | `test/type-check/consumer.ts(318,64)` fails. |
| `QueryRunner` directly depends on `_materializeGraph` | Fixed | `QueryRunner.ts` uses `QueryReadModelProvider.openQueryReadModel()`, and targeted grep finds no `_materializeGraph` in `QueryRunner.ts`. |
| Query read-model seam is fully green | Not true in this checkout | `graphQueryBoundedProvider.test.ts` fails by tripping `_materializeGraph` on exact id-only miss. |
| `LogicalTraversal` directly depends on `_materializeGraph` | Mostly fixed at direct-reference level | Targeted grep finds no `_materializeGraph` in `LogicalTraversal.ts`; it uses `QueryReadModelProvider`. |
| Live query read model can still route through materialization | Still real | `LiveQueryReadModelProvider.openQueryReadModel()` calls `ensureFreshState()`, wired from `RuntimeHost._ensureFreshState()`, and the exact-miss witness trips `_materializeGraph`. |
| QueryController observer snapshots materialize | Still real | `QueryController.ts:57-125`. |
| Sync read-adjacent materialization seam | Still real | `SyncController.ts:335`, `:358`; sync tests fail. |
| Patch/Checkpoint/Subscription materialization seams | Still real | Full test clusters fail with `_materializeGraph is not a function` or stale materialize-spy expectations. |
| Checkpoint schema support drift | Still real | CheckpointService failures show schema:5 rejected and schema:2/3/4 accepted contrary to tests. |
| Sync security defaults | Not revalidated in this checkpoint | The audit finding remains open; no Phase 0 command exercised auth/rate-limit/sanitized-error behavior. |
| "Rewrite RuntimeHost" | Rejected as next move | Evidence supports seam surgery; `RuntimeHost` is the host of several symptoms, not a safe broad rewrite target. |

## Push and Next Action

Do not push this as a release candidate. The branch is clean and
locally ahead, but release gates are red and one focused 0105 witness is
red.

Recommended immediate next action:

1. Repair or re-scope the red 0105 bounded query witness first. The
   current failing scale is not a broad `RuntimeHost` rewrite and not
   direct `LogicalTraversal` `_materializeGraph` coupling; it is the
   live query read-model opening path that still reaches
   `_ensureFreshState()` / `_materializeGraph`.
2. Then lock the public v17 contract: README, Getting Started, API
   snippets, runtime error text, and consumer type tests.
3. Continue one seam per cycle after that, with sync/patch/checkpoint/
   subscription kept separate unless a single shared reading-basis owner
   has already been proven by RED tests.

The checkpoint answer is: v17 is not dead, but it is also not
post-0105-clean. The first next slice should be one exposed read-model
scale, not a dragon hunt.

## 0123 Addendum

Cycle 0123 sharpens the "repair or re-scope" recommendation above:
do not attempt a production repair of the `graphQueryBoundedProvider`
witness inside v17.

`docs/design/0110-graph-query-bounded-read-model-provider.md` already
proved that the graph-level exact-id/id-only query path is GREEN
blocked without a real live-tail bounded query/checksum substrate. The
failing witness is therefore not a 0105 regression. 0105 fixed
`QueryRunner`'s runtime-shaped dependency. 0110 showed the default
graph provider path still lacks an honest live bounded source.

0123 chooses the honest v17 release scope:

- v17 may claim TypeScript migration, public API honesty,
  materialization-frontdoor deletion, optics/readings direction, and
  query read-model groundwork.
- v17 must not claim live large-graph bounded `graph.query()` residency
  over stale checkpoint plus live tail.
- The graph-level exact-id bounded-query witness remains visible as a
  post-v17 blocked witness, not a red v17 release gate.
