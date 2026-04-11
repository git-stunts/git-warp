# v17.0.0 — TypeScript Migration & API Redesign

The hill: ship as a TypeScript project with no gods, no sludge, and a
capability-namespaced public API. Every `.js` becomes `.ts`. Every god
object is decomposed. SSTS is the active standard.

## Critical path

```
LAYER 0 (unblocked — start here):
  CROSS_shared-provider-interfaces
  API_capability-interfaces
  GOD_query-builder
  SLUDGE_dead-code-cleanup
  SLUDGE_factory-functions-in-tests
  SLUDGE_content-access-duplication
  TS_convert-remaining-js

LAYER 1 (blocked by layer 0):
  API_warpgraph-factory ← capability-interfaces + shared-providers
  GOD_query-controller ← capability-interfaces + shared-providers
  GOD_materialize-controller ← shared-providers
  GOD_incremental-index-updater ← shared-providers
  GOD_strand-service ← capability-interfaces
  GOD_remaining-big-files ← shared-providers + index-updater
  SLUDGE_host-bag-injection ← shared-providers
  SLUDGE_detached-graph-duplication ← shared-providers
  TS_infrastructure-adapters ← convert-remaining-js
  TS_cli-viz-scripts ← convert-remaining-js

LAYER 2 (blocked by all gods + factory):
  API_migrate-consumers-to-capabilities

LAYER 3:
  API_kill-warpruntime ← migrate-consumers

LAYER 4:
  TS_publish-pipeline ← kill-warpruntime + adapters + cli

LAYER 5:
  TS_ssts-conformance-suite ← publish-pipeline
```

## Status key

- `[ ]` not started
- `[~]` in progress
- `[x]` done

## Items

Each `.md` file in this directory has YAML frontmatter with `id`,
`blocks`, and `blocked_by` fields. `grep blocked_by *.md` shows the
dependency graph.
