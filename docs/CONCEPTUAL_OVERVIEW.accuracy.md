---
accuracy_report: true
schema: git-warp-doc-accuracy-v1
source_document: docs/CONCEPTUAL_OVERVIEW.md
created: 2026-06-24
last_updated: 2026-06-24
reviewer: codex
evidence_policy: source-code-only
status: active
score: 58
score_label: partially_accurate
disposition: rewrite
keep:
  - multi_writer_git_ref_model
  - crdt_materialization_model
  - query_and_traversal_surfaces
  - worldline_observer_optic_direction
  - sync_auth_checkpoint_seek_advanced_capabilities
roll_into:
  - docs/CONCEPTUAL_OVERVIEW.md
  - docs/BEARING.md
  - docs/VISION.md
  - docs/releases/
cut:
  - universal_empty_tree_storage
  - absolute_git_invisibility
  - default_500_patch_checkpointing
  - unsupported_performance_memory_claims
  - universal_active_cursor_claim
  - implements_all_papers_claim
  - cli_dashboard_overclaim
---

# Conceptual Overview Accuracy Report

## Verdict

`docs/CONCEPTUAL_OVERVIEW.md` is useful as a reader-friendly shape of the project, but it is not accurate enough to remain as canonical product doctrine without a rewrite. The document mixes source-confirmed runtime behavior with implementation shortcuts, aspirational language, unsupported performance numbers, and broad claims that the source does not prove.

Score: **58/100**.

Disposition: **rewrite**.

Evidence rule: this report treats source code as truth. Markdown documents are not used as supporting evidence.

## Worth Keeping

- Keep the multi-writer model. Writer refs are real and use `refs/warp/<graph>/writers/<writer>` through `buildWriterRef`, and patch commits CAS against that writer ref before updating it ([RefLayout.ts:200](../src/domain/utils/RefLayout.ts#L200), [PatchCommitter.ts:58](../src/domain/services/PatchCommitter.ts#L58), [PatchCommitter.ts:141](../src/domain/services/PatchCommitter.ts#L141)).
- Keep the CRDT framing. Event IDs validate Lamport, writer, patch SHA, and op index; LWW resolves by comparing event IDs; OR-Set add and stable-frontier compaction are source-backed ([EventId.ts:30](../src/domain/utils/EventId.ts#L30), [LWW.ts:117](../src/domain/crdt/LWW.ts#L117), [ORSet.ts:114](../src/domain/crdt/ORSet.ts#L114), [ORSet.ts:392](../src/domain/crdt/ORSet.ts#L392)).
- Keep the query and traversal sections, but make the examples source-aligned. The fluent `match`, aggregate, and `run` path exists, and graph traversal exposes BFS through the traversal facade ([QueryBuilder.ts:183](../src/domain/services/query/QueryBuilder.ts#L183), [QueryBuilder.ts:256](../src/domain/services/query/QueryBuilder.ts#L256), [QueryBuilder.ts:260](../src/domain/services/query/QueryBuilder.ts#L260), [GraphTraversal.ts:113](../src/domain/services/query/GraphTraversal.ts#L113)).
- Keep worldline, observer, and optic as the conceptual direction. `ProjectionHandle.seek`, `ProjectionHandle.query`, observer construction, and the reified `Optic` class are source-backed runtime nouns ([ProjectionHandle.ts:113](../src/domain/services/ProjectionHandle.ts#L113), [ProjectionHandle.ts:245](../src/domain/services/ProjectionHandle.ts#L245), [ProjectionHandle.ts:249](../src/domain/services/ProjectionHandle.ts#L249), [Optic.ts:48](../src/domain/services/optic/Optic.ts#L48)).
- Keep sync, auth, checkpoint, seek, audit, bitmap-index, temporal, and wormhole concepts only as scoped capability descriptions. They are real surfaces, but the current prose often implies broader guarantees than the source proves ([RuntimeHostBoot.ts:72](../src/domain/warp/RuntimeHostBoot.ts#L72), [RuntimeHost.ts:898](../src/domain/RuntimeHost.ts#L898), [SyncAuthService.ts:67](../src/domain/services/sync/SyncAuthService.ts#L67), [BitmapIndexBuilder.ts:83](../src/domain/services/index/BitmapIndexBuilder.ts#L83), [TemporalQuery.ts:270](../src/domain/services/TemporalQuery.ts#L270), [AuditReceiptService.ts:226](../src/domain/services/audit/AuditReceiptService.ts#L226), [WormholeService.ts:292](../src/domain/services/WormholeService.ts#L292)).

## What To Rewrite

- Rewrite the storage explanation. Some commits may use Git's empty tree through `commitNode`, but patch commits write a tree containing patch/content entries through `commitNodeWithTree`; checkpoint creation also writes checkpoint tree data. The statement that every piece of data is an empty-tree commit is false ([GitGraphAdapter.ts:196](../src/infrastructure/adapters/GitGraphAdapter.ts#L196), [PatchCommitter.ts:115](../src/domain/services/PatchCommitter.ts#L115), [PatchCommitter.ts:137](../src/domain/services/PatchCommitter.ts#L137), [checkpointCreate.ts:91](../src/domain/services/state/checkpointCreate.ts#L91), [checkpointCreate.ts:219](../src/domain/services/state/checkpointCreate.ts#L219)).
- Rewrite "invisible to normal Git operations." The source supports custom refs under `refs/warp/...`, not absolute invisibility to Git. A normal default `git status` may stay clean, but refs and objects still exist and are inspectable through Git plumbing ([RefLayout.ts:200](../src/domain/utils/RefLayout.ts#L200), [RefLayout.ts:213](../src/domain/utils/RefLayout.ts#L213), [RefLayout.ts:225](../src/domain/utils/RefLayout.ts#L225)).
- Rewrite checkpoint policy. Auto-checkpointing is an optional open-time policy; the source does not establish a default every-500-patches runtime behavior ([RuntimeHostBoot.ts:72](../src/domain/warp/RuntimeHostBoot.ts#L72), [RuntimeHostBoot.ts:210](../src/domain/warp/RuntimeHostBoot.ts#L210), [RuntimeHost.ts:247](../src/domain/RuntimeHost.ts#L247), [RuntimeHost.ts:898](../src/domain/RuntimeHost.ts#L898)).
- Rewrite the query example before keeping it. The fluent API is real, but the example should be checked against the actual accepted `where`, traversal, and aggregate shapes rather than kept as prose-level intent ([QueryBuilder.ts:183](../src/domain/services/query/QueryBuilder.ts#L183), [QueryBuilder.ts:189](../src/domain/services/query/QueryBuilder.ts#L189), [QueryBuilder.ts:256](../src/domain/services/query/QueryBuilder.ts#L256)).
- Rewrite the time-travel section. Active cursor refs are real, the CLI has a seek command, and projection handles can seek; the current claim that all queries and reads automatically show active-cursor state is too broad without a source-backed boundary statement ([RefLayout.ts:244](../src/domain/utils/RefLayout.ts#L244), [ProjectionHandle.ts:113](../src/domain/services/ProjectionHandle.ts#L113), [seek.ts:25](../bin/cli/commands/seek.ts#L25), [shared.ts:115](../bin/cli/shared.ts#L115)).
- Rewrite the architecture section to focus on what the code currently proves: constructor-injected ports and runtime adapters for Node, Bun, Deno, and browser-facing entry points. Avoid claiming complete portability beyond tested and wired adapter surfaces ([NodeHttpAdapter.ts:101](../src/infrastructure/adapters/NodeHttpAdapter.ts#L101), [BunHttpAdapter.ts:178](../src/infrastructure/adapters/BunHttpAdapter.ts#L178), [DenoHttpAdapter.ts:174](../src/infrastructure/adapters/DenoHttpAdapter.ts#L174), [browser.ts:31](../browser.ts#L31)).

## What To Cut

- Cut "every piece of data is a Git commit that points to the empty tree." Patch and checkpoint commits can carry real tree data.
- Cut "completely invisible to normal Git operations" unless it is narrowed to porcelain behavior that has executable evidence.
- Cut "auto-checkpointing every 500 patches" as a default claim.
- Cut "O(1) neighbor lookups," "near-zero cold start," and "150-200 MB for a million nodes" until supported by reproducible benchmark or release evidence. Bitmap indexes exist, but these numbers are not established by the cited implementation alone ([BitmapIndexReader.ts:13](../src/domain/services/index/BitmapIndexReader.ts#L13), [BitmapIndexReader.ts:182](../src/domain/services/index/BitmapIndexReader.ts#L182), [BitmapIndexReader.ts:229](../src/domain/services/index/BitmapIndexReader.ts#L229)).
- Cut universal active-cursor language for application reads.
- Cut "the codebase implements all of it" for the academic papers. The source contains corresponding subsystems, but the statement is too broad for a source-only accuracy report.
- Cut "ASCII visualization dashboards" unless a dashboard surface is cited. The CLI command registration and seek/query/path commands exist; dashboard language is overclaimed ([warp-graph.ts:95](../bin/warp-graph.ts#L95), [query.ts:157](../bin/cli/commands/query.ts#L157), [path.ts:66](../bin/cli/commands/path.ts#L66), [seek.ts:248](../bin/cli/commands/seek.ts#L248)).

## Roll-In Recommendations

- Roll the source-confirmed core explanation back into `docs/CONCEPTUAL_OVERVIEW.md`: Git refs, writer chains, CRDT merge semantics, worldline reads, query/traversal, and bounded descriptions of sync/checkpoint/seek/observer/optic.
- Move roadmap-shaped or academic framing into `docs/BEARING.md` or `docs/VISION.md`, clearly labeled as direction rather than shipped runtime fact.
- Move performance and memory statements into release evidence under `docs/releases/` only when they cite reproducible benchmark commands and captured outputs.
- Move API examples into a source-checked guide or API reference section. Examples should compile or be covered by executable snippets before being used as teaching material.

## Suggested Replacement Shape

The replacement conceptual overview should be short and strict:

- What git-warp stores: Git objects and custom refs under `refs/warp/...`, with patch data stored in patch/content trees where applicable.
- How writes work: each writer appends a CAS-protected patch chain.
- How reads work: application code reads through worldlines/projections, with checkpoints and indexes as acceleration mechanisms rather than conceptual requirements.
- How convergence works: OR-Set, LWW, version vectors, and event IDs.
- What is available today: query, traversal, sync, auth, checkpoints, seek, observer, optic, temporal, audit, and wormhole capabilities, each with bounded claims.
- What not to promise: unsupported latency, memory size, total paper coverage, or universal CLI visualization behavior.

## Report Schema

Future sibling reports should keep the same frontmatter fields:

- `accuracy_report`: always `true`.
- `schema`: currently `git-warp-doc-accuracy-v1`.
- `source_document`: path to the audited Markdown document.
- `created`: ISO date when the report was first written.
- `last_updated`: ISO date when the report was last materially revised.
- `reviewer`: agent or human reviewer identifier.
- `evidence_policy`: expected to be `source-code-only` unless the report explicitly audits a non-code artifact.
- `status`: `active`, `superseded`, or `closed`.
- `score`: integer from 0 to 100.
- `score_label`: compact machine-readable verdict.
- `disposition`: `keep`, `revise`, `rewrite`, `archive`, or `delete`.
- `keep`, `roll_into`, and `cut`: short machine-readable arrays for triage.
