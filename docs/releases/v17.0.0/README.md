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
  [ ] INFRA_uniform-git-cas
  [ ] INFRA_index-builder-on-git-cas
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

ST-7 (multi-package publish + real extraction):
  [ ] INFRA_multipackage-publish-pipeline           ← blocked_by TS_publish-pipeline
  [ ] INFRA_extract-warp-orset-package-post-publish ← deferred successor to 0020
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
