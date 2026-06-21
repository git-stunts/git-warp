# TSC Zero Agent Merge Audit

Date: 2026-06-20

Issue: [#505](https://github.com/git-stunts/git-warp/issues/505)

Historical source: B171 from the TSC Zero retrospective.

PR: [#73](https://github.com/git-stunts/git-warp/pull/73)
(`1391e68f9b7b99d5c80791e441e08e1069be3a7f`)

## Verdict

Retired. No revert is required.

The original backlog card said 27 files were merged through
`checkout --theirs`. Git does not preserve that operator action directly, and
the 27-file count is not reproducible from repository metadata. The closest
reproducible source of truth is Git's remerge reconstruction for the ten
`worktree-agent-*` merge commits in PR #73.

That reconstruction yields 55 unique conflict-resolution paths:

- 44 production, runtime, CLI, visualization, infrastructure, and script paths
- 10 test paths
- 1 lint configuration path

This audit treats those 55 paths as the authoritative closeout scope.

## Evidence Commands

```bash
gh pr view 73 --json number,title,state,mergedAt,mergeCommit,baseRefName,headRefName,files

git show --no-patch --pretty=raw 1391e68f9b7b99d5c80791e441e08e1069be3a7f

for commit in \
  c9671d51 b4d2b0b7 f6d5c066 a7c6e7bd 4562ab94 \
  b4bdd83d ab782c72 ff39b132 98588d34 3bb3b437
do
  git show --remerge-diff --name-only --format='' "$commit"
done | sed '/^$/d' | sort -u
```

The same merge commits were also inspected with:

```bash
git show --remerge-diff <commit>
```

## Merge Commits

| Commit | Subject |
| --- | --- |
| `c9671d51` | Merge branch `worktree-agent-a3c8ac74` |
| `b4d2b0b7` | Merge branch `worktree-agent-aa22fb83` |
| `f6d5c066` | Merge branch `worktree-agent-a81ab056` |
| `a7c6e7bd` | Merge branch `worktree-agent-a90cb614` |
| `4562ab94` | Merge branch `worktree-agent-a6c61824` |
| `b4bdd83d` | Merge branch `worktree-agent-a9f2120f` |
| `ab782c72` | Merge branch `worktree-agent-a752bfa8` |
| `ff39b132` | Merge branch `worktree-agent-ae175dcf` |
| `98588d34` | Merge branch `worktree-agent-a7651f20` |
| `3bb3b437` | Merge branch `worktree-agent-a3ae68f1` |

## Reconstructed Paths

<!-- tsc-zero-agent-merge-audit-paths:start -->

- `bin/cli/commands/bisect.js`
- `bin/cli/commands/debug/conflicts.js`
- `bin/cli/commands/query.js`
- `bin/cli/commands/strand/materialize.js`
- `bin/cli/commands/verify-audit.js`
- `bin/cli/commands/verify-index.js`
- `bin/presenters/index.js`
- `bin/presenters/text.js`
- `bin/warp-graph.js`
- `eslint.config.js`
- `src/domain/WarpRuntime.js`
- `src/domain/services/AdjacencyNeighborProvider.js`
- `src/domain/services/AnchorMessageCodec.js`
- `src/domain/services/AuditMessageCodec.js`
- `src/domain/services/BitmapIndexBuilder.js`
- `src/domain/services/BoundaryTransitionRecord.js`
- `src/domain/services/CheckpointMessageCodec.js`
- `src/domain/services/CheckpointSerializerV5.js`
- `src/domain/services/CheckpointService.js`
- `src/domain/services/ConflictAnalyzerService.js`
- `src/domain/services/HttpSyncServer.js`
- `src/domain/services/IncrementalIndexUpdater.js`
- `src/domain/services/IndexRebuildService.js`
- `src/domain/services/JoinReducer.js`
- `src/domain/services/PatchBuilderV2.js`
- `src/domain/services/PatchMessageCodec.js`
- `src/domain/services/QueryBuilder.js`
- `src/domain/services/StateReaderV5.js`
- `src/domain/services/StrandService.js`
- `src/domain/services/SyncAuthService.js`
- `src/domain/services/SyncController.js`
- `src/domain/services/TemporalQuery.js`
- `src/domain/services/WarpStateIndexBuilder.js`
- `src/domain/services/WormholeService.js`
- `src/domain/trust/TrustCanonical.js`
- `src/domain/trust/TrustEvaluator.js`
- `src/domain/trust/TrustRecordService.js`
- `src/domain/trust/TrustStateBuilder.js`
- `src/domain/types/DeliveryObservation.js`
- `src/domain/utils/MinHeap.js`
- `src/domain/warp/comparison.methods.js`
- `src/infrastructure/adapters/CasSeekCacheAdapter.js`
- `src/infrastructure/adapters/GitGraphAdapter.js`
- `src/visualization/renderers/ascii/path.js`
- `src/visualization/renderers/ascii/seek.js`
- `test/unit/domain/WarpCore.emit.test.js`
- `test/unit/domain/WarpGraph.audit.test.js`
- `test/unit/domain/services/AuditReceiptService.test.js`
- `test/unit/domain/services/AuditVerifierService.test.js`
- `test/unit/domain/services/LogicalBitmapIndexBuilder.test.js`
- `test/unit/domain/services/LogicalIndexBuildService.test.js`
- `test/unit/domain/services/MaterializedViewService.test.js`
- `test/unit/domain/trust/TrustAdversarial.test.js`
- `test/unit/domain/trust/TrustEvaluator.test.js`
- `test/unit/domain/trust/TrustRecordService.convergence.test.js`

<!-- tsc-zero-agent-merge-audit-paths:end -->

## Audit Notes

The reviewed remerge hunks fell into four risk classes.

| Risk class | Historical examples | Current disposition |
| --- | --- | --- |
| Truthiness replacing nullish checks | `QueryBuilder.js`, `WormholeService.js`, `bin/warp-graph.js` | Current query and aggregation owners branch on explicit `undefined` and `null` semantics where empty labels, empty arrays, or false booleans are behaviorally significant. |
| Raw errors replacing domain errors | `WarpRuntime.js`, `SyncAuthService.js` | Current runtime helpers throw `WarpError` for trust configuration, and sync auth throws `SyncError` for configuration failures. |
| Helper deletion or inline rewrites | `WarpRuntime.js`, `CheckpointSerializerV5.js`, `StateReaderV5.js` | Current TS modules restored named helpers around effect pipeline construction, checkpoint serialization, state reading, and aggregation. |
| Type-only conflict resolution in tests and presenters | test paths, presenter paths, CLI output paths | Current TS-only surfaces compile through `tsconfig.src.json`, `tsconfig.test.json`, and eslint; no old `src` or `bin` `.js` files remain. |

The highest-risk historical hunks were checked against these current owners:

| Current owner | Relevant historical risk | Disposition |
| --- | --- | --- |
| `src/domain/runtimeHelpers.ts` | trust validation, effect pipeline construction, raw `Error` drift | Uses `WarpError`, explicit nullish checks, and named `buildEffectPipeline()`. |
| `src/domain/warp/RuntimeHostBoot.ts` | open-option normalization and trust spread drift | Uses `normalizeTrustConfig()` through the runtime-backed `WarpOpenOptions` boundary. |
| `src/domain/services/query/QueryBuilder.ts` | label and aggregate truthiness drift | Validates labels, preserves empty string labels by using `label !== undefined`, and validates aggregate field types. |
| `src/domain/services/query/QueryRunner.ts` | traversal filter drift | Forwards labels only when defined and keeps query result projection deterministic. |
| `src/domain/services/query/QueryAggregation.ts` | aggregate active-key drift | Uses `spec[key] !== undefined && spec[key] !== null`, not truthiness. |
| `src/domain/services/sync/SyncAuthService.ts` | raw `Error`, wall-clock, and signature validation drift | Uses `SyncError`, `SyncSecret`, lamport timestamps, and explicit missing-header checks. |
| `src/domain/services/state/CheckpointSerializer.ts` | checkpoint fallback and schema error drift | Uses `SchemaUnsupportedError`, `WarpError`, sorted serialization helpers, and explicit envelope decoding. |
| `src/domain/services/state/StateReader.ts` | visible edge/content filtering drift | Keeps reader behavior in named functions with current state-reader tests. |
| `src/domain/services/WormholeService.ts` | removed null guard and parent-chain drift | Current tests cover nullish JSON input, required fields, and malformed wormhole payloads. |

## Closeout

B171/#505 was a historical audit gap, not a current feature request. The
reconstructed merge conflict scope has been reviewed against the current TS
owners, and the surviving surfaces have explicit tests or type/lint gates.

No suspicious semantic drift remains from the PR #73 conflict-resolution
events. The issue can close with this artifact.
