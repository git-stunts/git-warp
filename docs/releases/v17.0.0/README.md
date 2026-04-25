# v17.0.0 — TypeScript Migration & Streaming ORSets

The hill: ship as a TypeScript project with no gods, no sludge, and a
bounded-residency streaming ORSet line. Every `.js` becomes `.ts`.
Every god object is decomposed. SSTS is the active standard. `v17`
keeps the current graph substrate; Echo-shaped graph-model convergence
is explicitly deferred to the next major.

## Critical path

```
LAYER 0 (foundation):
  [x] CROSS_shared-provider-interfaces
  [x] API_capability-interfaces          ← 10 interfaces shipped
  [x] GOD_query-builder
  [x] SLUDGE_factory-functions-in-tests  ← cycle 0055 hill-met; constructor-wrapper
                                          sludge already died in `2e99c0cb`;
                                          wire-format helpers remain intentional test
                                          transport fixtures
  [x] TS_wave-01-codec through TS_wave-09-gods-and-monsters  ← DEATHBRINGER
  [✗] SLUDGE_dead-code-cleanup           ← cycle 0052 not-met; code is still live
                                          through `conflictTargetIdentity.ts` /
                                          conflict analysis dispatch; owning trunk
                                          is `PROTO_purge-fake-models`
  [x] SLUDGE_content-access-duplication  ← cycle 0051 hill-met; implementation duplication already
                                          reduced into `QueryContent.ts`; remaining
                                          `NodeContent` / `EdgeContent` surface belongs
                                          to `API_migrate-consumers-to-capabilities`

LAYER 1 (god kills + conversions):
  [x] API_warpgraph-factory              ← WORLDBUILDER (openWarpGraph + admission surface)
  [x] GOD_query-controller
  [x] GOD_materialize-controller
  [x] GOD_strand-service                 ← dissolved → coordinator + validation
  [x] GOD_remaining-big-files            ← cycle 0058 hill-met; named files are already
                                          below the ceiling, the only serious
                                          index-builder residue died in `0057`,
                                          and the remaining streaming / boundary
                                          truth lives under
                                          `CORE_streaming-memory-audit` +
                                          `PROTO_purge-boundary-leaks`
  [x] SLUDGE_detached-graph-duplication  ← cycle 0062 hill-met; detached
                                          reads now flow through
                                          `DetachedGraphFactory` in both
                                          `QueryController` and `Worldline`
  [~] SLUDGE_host-bag-injection          ← ongoing per-god-kill
  [x] GOD_incremental-index-updater     ← cycle 0056 hill-met; god split already landed
                                          into `IndexNodeUpdater` /
                                          `IndexEdgeUpdater`, and the remaining
                                          shard-I/O / raw-shape cleanup belongs to
                                          `PROTO_purge-boundary-leaks` +
                                          `MODEL_incremental-index-updater-shape-sludge`
  [x] TS_convert-remaining-js            ← cycle 0049 premise invalid;
                                          no live `.js` remain in
                                          `src/`, `bin/`, or `scripts/`
  [x] TS_infrastructure-adapters         ← repo truth already satisfied;
                                          infrastructure adapters are `.ts`
  [x] TS_cli-viz-scripts                 ← repo truth already satisfied;
                                          CLI / viz / scripts are `.ts` or `.sh`
  [x] TS_eliminate-remaining-js-and-dts ← cycle 0050 hill-met;
                                          tail now only
                                          `src/globals.d.ts`; cycle 0069 then
                                          deleted the blocked
                                          `_wiredMethods.d.ts` runtime shim

LAYER 2 (the exorcism):
  [x] API_migrate-consumers-to-capabilities ← cycles 0059-0064 hill-met across the public
                                          factory + sync seam, and cycle 0060
                                          hill-met for the internal observer seam:
                                          `openWarpGraph()` now binds
                                          runtime-checked capability bags,
                                          `_runtime` is gone from
                                          `WarpGraph`, direct peer sync
                                          accepts `graph.sync.syncWith(peerGraph)`,
                                          and `Observer.ts` now depends on
                                          `ObserverBacking` instead of
                                          `WarpRuntime`; cycle 0061 then moved
                                          `QueryController.ts` onto explicit
                                          detached-read + hash-state seams.
                                          Cycle 0062 then moved
                                          `Worldline.ts` onto the same
                                          detached-read seam, and cycle 0063
                                          moved `WarpApp.ts` onto an explicit
                                          app-surface contract. Remaining work
                                          was then reduced further by cycle
                                          0064: `WarpCore.ts` no longer imports
                                          `WarpRuntime` directly and no longer
                                          calls `WarpRuntime.prototype.*`.
                                          The consumer migration task is now
                                          materially satisfied. The remaining
                                          work is the `openWarpGraph()` /
                                          `WarpRuntime` composition-root residue

LAYER 3:
  [~] API_kill-warpruntime               ← cycles 0066 and 0070 both proved
                                          the runtime kill is not one slice.
                                          Cycle 0067 completed the public
                                          `WarpGraph` bridge cut, cycle 0068
                                          completed the helper-wrapper seam
                                          cut, and cycle 0069 deleted the
                                          runtime wiring / `_wiredMethods`
                                          blocker. Cycle 0071 then completed
                                          the public composition-root cut, and
                                          cycle 0072 then completed the
                                          controller/service host-type cut.
                                          Cycle 0073 then deleted the
                                          `_internal.ts` compatibility shim.
                                          Cycle 0074 resplit the exposed
                                          remainder, and cycle 0075 then
                                          completed the `openWarpGraph()`
                                          bridge cut. Cycle 0076 then
                                          completed the `WarpCore` bridge
                                          cut. Cycle 0077 then proved the
                                          class delete is still internally
                                          split. Cycle 0078 then completed
                                          the source-side runtime host
                                          product cut. Cycle 0079 then proved
                                          the remaining test/helper blocker
                                          also needs an internal split.
                                          Cycle 0080 then completed the
                                          helper/seed half of that split. The live
                                          remaining order is now:
                                          `DX_migrate-runtime-suites-off-warpruntime`
                                          → `DX_migrate-tests-and-seed-helpers-off-warpruntime`
                                          → `API_delete-warpruntime-class`
                                          → `API_kill-warpruntime`

LAYER 4 (launch-prep only; park until the repo is otherwise ready to ship):
  [ ] TS_publish-pipeline

LAYER 5 (launch-prep proof and release hardening tail):
  [ ] TS_ssts-conformance-suite
  [ ] SCORECARD
```

## Infrastructure modernization (parallel track)

```
  [ ] INFRA_unify-persistence-on-git-cas
  [ ] INFRA_uniform-git-cas
  [x] INFRA_index-builder-on-git-cas     ← cycle 0057 hill-met; streaming
                                          rebuilds now require a real
                                          streaming storage seam,
                                          shard payloads write through
                                          git-cas-backed storage, and
                                          finalize keeps chunked shard
                                          paths instead of readback-merge
  [ ] INFRA_plumbing-violations
  [ ] INFRA_substrate-upgrade-tool
```

## Explicitly deferred past `v17`

- Echo-shaped graph-substrate convergence now lives in
  [`../../method/backlog/v18.0.0/README.md`](../../method/backlog/v18.0.0/README.md)
- observer, admission, and doctrine convergence now live in
  [`../../method/backlog/v19.0.0/README.md`](../../method/backlog/v19.0.0/README.md)

## Shadow-Trie ORSet + package reorg (Design 0018)

Replace memory-resident ORSet with a bounded-residency trie stored as
native Git objects. Extract `warp-orset` package early; `warp-kernel`
and `warp-adapters` extract later once the ORSet line proves its seams.

```
ST-0 (planning + workspace shells):
  [x] DX_design-0018-flesh-out          ← design doc fleshed out, retro closed
  [x] DX_v17-lane-readme-update         ← release ledger updated
  [x] INFRA_npm-workspaces-scaffold     ← cycle 0019 hill-met
  [✗] INFRA_extract-warp-orset-package  ← cycle 0020 not-met (publish-surface
                                          blocker). Split into the 3 items in
                                          ST-1 (seam) and ST-7 (publish+extract).

ST-1 (ORSet seam in root + storage contracts):
  [x] PROTO_orset-seam-in-root          ← cycle 0021 hill-met
  [ ] PROTO_orsetlike-contract          ← retained as a reality-check
                                          artifact after cycle 0032;
                                          downstream planning now uses
                                          concrete `ORSet` / `StateSession`
                                          nouns instead of `ORSetLike`
  [x] PROTO_blake3-route-key            ← cycle 0022 hill-met
  [x] PROTO_git-trie-store-port         ← cycle 0026 hill-met
  [x] INFRA_git-trie-store-adapter      ← cycle 0028 hill-met

ST-2 (trie foundation):
  [x] PROTO_trie-codec-and-geometry     ← cycle 0027 hill-met
  [x] PROTO_trie-cursor                 ← cycle 0029 hill-met
  [x] PERF_lru-page-cache               ← cycle 0031 hill-met
  [x] PROTO_trie-flush                  ← cycle 0030 hill-met
  [x] DESIGN_0034_unify-seek-cache-and-checkpoints  ← cycle 0034 hill-met

ST-3 (ShadowTrieORSet):
  [x] PROTO_shadow-trie-orset         ← cycle 0038 hill-met
  [x] PROTO_trie-compaction           ← cycle 0039 hill-met
  [x] TRUST_shadow-trie-semilattice-pbt ← cycle 0045 hill-met

ST-4 (async firewall):
  [x] PROTO_state-session-async       ← cycle 0040 hill-met
  [x] PROTO_joinreducer-state-session ← cycle 0041 hill-met
  [x] PROTO_gc-state-session          ← cycle 0042 hill-met

ST-5 (kernel integration):
  [x] PROTO_materialize-integration     ← cycle 0043 hill-met
  [x] PROTO_index-builder-trie-iteration ← cycle 0044 hill-met
  [x] PERF_trie-geometry-and-memory-profile ← cycle 0046 hill-met with explicit
                                              1M stress caveat

ST-6 (broader package extraction):
  [✗] INFRA_extract-warp-kernel-package      ← cycle 0047 not-met (same
                                                publish-surface trap as 0020)
  [✗] INFRA_extract-warp-adapters-package    ← cycle 0048 not-met (downstream
                                                of the same trap)

ST-7 (multi-package publish + real extraction):
  [ ] INFRA_multipackage-publish-pipeline           ← blocked_by TS_publish-pipeline
  [ ] INFRA_extract-warp-kernel-package-post-publish ← deferred successor to 0047
  [ ] INFRA_extract-warp-orset-package-post-publish ← deferred successor to 0020
  [ ] INFRA_extract-warp-adapters-package-post-publish ← deferred successor to 0048
```

**Cycle 0020 note:** The original `INFRA_extract-warp-orset-package`
was closed as `not-met` because warp-orset was private (per 0019),
and extracting into it would produce either a private-package import
bomb in published source or a fake package boundary. The work is now
split: seam organization (ST-1) does not require publishing changes;
actual extraction (ST-7) depends on a real multi-package publish
pipeline. The new extraction item deliberately has a new ID
(`-post-publish` suffix) to preserve history.

**Seam architecture:** concrete `ORSet` is the synchronous in-memory
form. `StateSession` is the async domain-facing contract for
trie-backed state. `ShadowTrieORSet` is an internal engine behind the
session — it does NOT pretend to implement the synchronous concrete
surface.

**git-cas carve-out:** Core trie publication uses native Git objects
and is explicitly out of scope for INFRA_unify-persistence-on-git-cas.
See Design 0018 for details.

**Launch-prep rule:** `TS_publish-pipeline`,
`INFRA_multipackage-publish-pipeline`, and the post-publish extraction
items are intentionally late. Keep them parked until `v17` is
otherwise essentially release-candidate ready.

## Status key

- `[ ]` not started
- `[~]` in progress
- `[x]` done
- `[!]` blocked

## Session record

### Claudius Maximus I (sessions 1-3)
- Converted 217 domain files to TypeScript
- Established the Sacred Technique and migration policy
- Slayed the first 11 gods, built trust pipeline

### Claudius Maximus II: DEATHBRINGER (session 4)
- 30 gods slain, 1 titan banished (src/visualization/)
- Domain: 316 .ts / 0 .js (100% TypeScript)
- V5/V1 suffix purge across 60 files
- CBOR substrate migration for index shards

### Claudius Maximus III: WORLDBUILDER THE TRIUMPHANT (session 5)
- tsc: 1,779 → 0. lint: 725 → 0. tests: 143 → 0.
- 9 source gods slain (GitGraphAdapter, InMemoryGraphAdapter,
  SyncController, LogicalTraversal, AuditReceiptService, QueryRunner,
  AuditChainVerifier, doctor/checks, seek)
- 378 test files converted .test.js → .test.ts (0 .test.js remaining)
- 21 dead visualization/presenter test files deleted
- openWarpGraph() factory shipped with admission architecture surface
  (commitment/folding/revelation/governance)
- 5 shared test fixtures shipped (mockPorts, mockHost, patchFactories,
  errorFactories, index barrel)
- Paper VII and strand spec read and internalized

## Unplanned work shipped

- `PropValue` type — kills `LWWRegister<unknown>` across the codebase
- `RuntimePatchCollector`, `RuntimeDetachedFactory`, `RuntimeStateStore`
- `detachedOpen.ts` — shared helper for graph cloning
- `gitErrorClassification.ts` — extracted from GitGraphAdapter
- `inMemoryHashing.ts` — extracted from InMemoryGraphAdapter
- `SyncControllerTypes.ts` — extracted from SyncController
- `seekCursorHelpers.js` — extracted from seek.js
- `checksAux.js` — extracted from doctor/checks.js
- `WarpGraph.ts` — admission architecture factory + capability surface
- Shared test fixtures: `mockPorts.ts`, `mockHost.ts`, `patchFactories.ts`,
  `errorFactories.ts`, `index.ts`

## Items

Each `.md` file in this directory has YAML frontmatter with `id`,
`blocks`, and `blocked_by` fields. `grep blocked_by *.md` shows the
dependency graph.
