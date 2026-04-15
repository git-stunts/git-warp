# v17.0.0 — TypeScript Migration & API Redesign

The hill: ship as a TypeScript project with no gods, no sludge, and a
capability-namespaced public API. Every `.js` becomes `.ts`. Every god
object is decomposed. SSTS is the active standard.

## Critical path

```
LAYER 0 (foundation):
  [x] CROSS_shared-provider-interfaces
  [x] API_capability-interfaces          ← 10 interfaces shipped
  [x] GOD_query-builder
  [x] SLUDGE_factory-functions-in-tests
  [x] TS_wave-01-codec through TS_wave-09-gods-and-monsters  ← DEATHBRINGER
  [!] SLUDGE_dead-code-cleanup           ← BLOCKED (ConflictCandidateCollector)
  [ ] SLUDGE_content-access-duplication

LAYER 1 (god kills + conversions):
  [x] API_warpgraph-factory              ← WORLDBUILDER (openWarpGraph + admission surface)
  [x] GOD_query-controller
  [x] GOD_materialize-controller
  [x] GOD_strand-service                 ← dissolved → coordinator + validation
  [x] GOD_remaining-big-files            ← WORLDBUILDER (9 gods slain)
  [x] SLUDGE_detached-graph-duplication
  [~] SLUDGE_host-bag-injection          ← ongoing per-god-kill
  [ ] GOD_incremental-index-updater
  [ ] TS_convert-remaining-js            ← 29 infra .js + 42 CLI .js
  [ ] TS_infrastructure-adapters
  [ ] TS_cli-viz-scripts

LAYER 2 (the exorcism):
  [ ] API_migrate-consumers-to-capabilities

LAYER 3:
  [ ] API_kill-warpruntime               ← THE DEVIL DIES

LAYER 4:
  [ ] TS_publish-pipeline

LAYER 5:
  [ ] TS_ssts-conformance-suite
  [ ] SCORECARD
```

## Infrastructure modernization (parallel track)

```
  [ ] INFRA_unify-persistence-on-git-cas
  [ ] INFRA_index-builder-on-git-cas
  [ ] INFRA_plumbing-violations
  [ ] INFRA_substrate-upgrade-tool
```

## Shadow-Trie ORSet + package reorg (Design 0018)

Replace memory-resident ORSet with a bounded-residency trie stored as
native Git objects. Extract `warp-orset` package early; `warp-kernel`
and `warp-adapters` extract later once the ORSet line proves its seams.

```
ST-0 (planning + workspace shells):
  [ ] DX_design-0018-flesh-out
  [ ] DX_v17-lane-readme-update
  [ ] INFRA_npm-workspaces-scaffold
  [ ] INFRA_extract-warp-orset-package

ST-1 (ORSet seam + storage contracts):
  [ ] PROTO_orsetlike-contract
  [ ] PROTO_blake3-route-key
  [ ] PROTO_git-trie-store-port
  [ ] INFRA_git-trie-store-adapter

ST-2 (trie foundation):
  [ ] PROTO_trie-codec-and-geometry
  [ ] PROTO_trie-cursor
  [ ] PERF_lru-page-cache
  [ ] PROTO_trie-flush
  [ ] PROTO_checkpoint-envelope-publication

ST-3 (ShadowTrieORSet):
  [ ] PROTO_shadow-trie-orset
  [ ] PROTO_trie-compaction
  [ ] TRUST_shadow-trie-semilattice-pbt

ST-4 (async firewall):
  [ ] PROTO_state-session-async
  [ ] PROTO_joinreducer-state-session
  [ ] PROTO_gc-state-session

ST-5 (kernel integration):
  [ ] PROTO_materialize-integration
  [ ] PROTO_index-builder-trie-iteration
  [ ] PERF_trie-geometry-and-memory-profile

ST-6 (broader package extraction):
  [ ] INFRA_extract-warp-kernel-package
  [ ] INFRA_extract-warp-adapters-package
```

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
