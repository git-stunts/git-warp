---
cycle: 0194
task_id: V18_real_source_inventory_collector
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
release_home: v18.0.0
bearing_task: 46
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
---

# V18 Real Source Inventory Collector

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Collect real graph-history source facts into `GraphModelMigrationSourceInventory`
without writing graph history.

## Playback Questions

- Does the collector read actual graph refs or an explicit graph-history
  source instead of only fixture JSON?
- Does it preserve writer chains, patch descriptors, source basis, snapshot
  reference, and content source facts?
- Does incomplete source evidence become structured fatal inventory notices?
- Does the collector stay outside domain code when touching Git, filesystem,
  process, or wire formats?
- Does the dry-run CLI gain a path from real source facts to planner request
  values without adding an apply mode?

## Existing Shape

Slices 36 through 41 created source inventory nouns, a dry-run planner, a
request JSON adapter, and a non-destructive CLI. The missing bridge is a real
collector that can read graph history into those nouns. The collector belongs
in adapters or scripts because it touches host state.

## Chosen Boundary

Add a collector adapter or script-local collector that:

- receives explicit repository and graph identifiers;
- reads writer refs and ordered patch identifiers;
- creates `GraphModelMigrationWriterChainDescriptor` and
  `GraphModelMigrationPatchDescriptor` values;
- records source basis and state snapshot identity when available;
- finds legacy content source facts for `_content*` compatibility records;
- returns `GraphModelMigrationSourceInventory`.

The first collector remains dry-run only. It must not archive refs, create
migrated commits, or promote lineages.

## Non-Goals

- Do not write migrated history.
- Do not finalize or archive old lineages.
- Do not broaden equivalence fixtures.
- Do not change public graph APIs.
- Do not claim full production migration readiness.

## RED Plan

Add collector tests with a fake or in-memory graph-history source:

- complete source history creates usable source inventory;
- missing source basis produces a fatal inventory notice;
- incomplete writer chain or patch descriptor collection fails closed;
- collected content source keys become planner content mappings;
- no write-capable port method is invoked.

## GREEN Plan

Implement the smallest source collector over existing persistence/adapter
surfaces. If the available production ports are too broad or ambiguous, define
a collector-local port in the adapter/script layer rather than leaking host
shape into domain.

## Verification

```text
npx vitest run test/unit/scripts/v18-graph-model-source-inventory-collector.test.ts --reporter=verbose
npm run typecheck
npm run lint:semgrep
npm run lint:sludge
git diff --check HEAD
```

## Closeout Criteria

- Real source collection exists for dry-run planning.
- Fatal collection errors are structured inventory facts.
- The dry-run CLI can invoke collection without adding write mode.
- Slice 47 can lower planned operations against collected source evidence.

## SSJS Scorecard

- Runtime-backed forms: green when collected facts become migration nouns.
- Boundary validation: green when raw graph history is decoded outside domain.
- Behavior ownership: green when collector collects and domain plans.
- Message parsing: green; no behavior branches on diagnostic text.
- Ambient time or entropy: green; no clocks or randomness in domain.
- Fake shape trust or cast-cosplay: green when collector tests use explicit
  fakes or ports instead of loose object bags.
