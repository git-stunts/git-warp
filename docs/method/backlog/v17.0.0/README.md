# v17.0.0 — TypeScript Migration & API Redesign

The hill: ship as a TypeScript project with no gods, no sludge, and a
capability-namespaced public API. Every `.js` becomes `.ts`. Every god
object is decomposed. SSTS is the active standard.

## Critical path

```
LAYER 0 (unblocked — start here):
  [x] CROSS_shared-provider-interfaces
  [x] API_capability-interfaces
  [x] GOD_query-builder
  [!] SLUDGE_dead-code-cleanup               ← BLOCKED (ConflictCandidateCollector)
  [x] SLUDGE_factory-functions-in-tests       ← done (plan corrected)
  [ ] SLUDGE_content-access-duplication
  [ ] TS_convert-remaining-js

LAYER 1 (blocked by layer 0):
  [ ] API_warpgraph-factory ← capability-interfaces + shared-providers
  [x] GOD_query-controller ← capability-interfaces + shared-providers
  [x] GOD_materialize-controller ← shared-providers (pure DI, bridge WIP)
  [ ] GOD_incremental-index-updater ← shared-providers
  [x] GOD_strand-service ← capability-interfaces (dissolved → coordinator + validation)
  [ ] GOD_remaining-big-files ← shared-providers + index-updater
  [~] SLUDGE_host-bag-injection ← doing per-god-kill, not separate
  [x] SLUDGE_detached-graph-duplication ← detachedOpen.ts shared helper
  [ ] TS_infrastructure-adapters ← convert-remaining-js
  [ ] TS_cli-viz-scripts ← convert-remaining-js

LAYER 2 (blocked by all gods + factory):
  [ ] API_migrate-consumers-to-capabilities

LAYER 3:
  [ ] API_kill-warpruntime ← migrate-consumers

LAYER 4:
  [ ] TS_publish-pipeline ← kill-warpruntime + adapters + cli

LAYER 5:
  [ ] TS_ssts-conformance-suite ← publish-pipeline
```

## Status key

- `[ ]` not started
- `[~]` in progress
- `[x]` done
- `[!]` blocked

## Unplanned work shipped

- `PropValue` type — kills `LWWRegister<unknown>` across the codebase
- `RuntimePatchCollector`, `RuntimeDetachedFactory`, `RuntimeStateStore` —
  adapter implementations for MaterializeController DI
- `detachedOpen.ts` — shared helper for graph cloning (dedup)

## Items

Each `.md` file in this directory has YAML frontmatter with `id`,
`blocks`, and `blocked_by` fields. `grep blocked_by *.md` shows the
dependency graph.
