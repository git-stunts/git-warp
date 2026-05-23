---
cycle: 0185
task_id: V18_migration_source_inventory
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
release_home: v18.0.0
bearing_task: 37
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
---

# V18 Migration Source Inventory

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Name the exact source facts a graph-model migration needs before building a
planner or script.

## Playback Questions

- Does the inventory identify patch history, current materialized state, and
  blob/content sources separately?
- Does it distinguish adapter-collected facts from domain migration facts?
- Does it record writer refs and patch order without rewriting history?
- Does it expose missing source facts as fatal planning errors?
- Can a dry-run planner consume the inventory without Git side effects?

## Existing Shape

Migration needs more than current materialized state. It needs patch order,
writer chains, patch identity, content blob references, and enough basis
information to prove equivalence. Those facts currently live across adapters,
patch journals, state readers, and content storage.

If the planner reaches into all of those surfaces ad hoc, migration will
become a script-shaped tangle.

## Chosen Boundary

Design a migration source inventory object. Adapter or script code collects
facts into the inventory. Domain planning code consumes the inventory.

The inventory should contain:

- graph identity;
- source basis;
- writer chain descriptors;
- ordered patch descriptors;
- patch operation descriptors;
- visible state snapshot reference;
- content/blob references needed by content attachment projection;
- collection warnings and fatal errors.

Collection can be adapter-specific. The inventory object must be portable and
deterministic.

## Non-Goals

- Do not implement CLI collection yet.
- Do not serialize the inventory yet.
- Do not migrate data.
- Do not bypass existing patch journal ports.
- Do not use ambient wall-clock time.

## RED Plan

Add tests for inventory construction:

- missing source basis is fatal;
- duplicate patch identity is rejected;
- patch order must be deterministic per writer;
- warnings do not make the inventory unusable;
- fatal collection errors prevent planner use.

## GREEN Plan

Implement the inventory as domain migration input types. Keep adapter-specific
collection in later slices. If existing concepts can represent writer or patch
identity honestly, reuse them; otherwise create focused migration nouns rather
than loose string bags.

## Verification

```text
npx vitest run test/unit/domain/migrations/GraphModelMigrationSourceInventory.test.ts --reporter=verbose
npx eslint src/domain/migrations test/unit/domain/migrations/GraphModelMigrationSourceInventory.test.ts
npm run typecheck
npm run lint:sludge
git diff --check HEAD
```

## Closeout Criteria

- Migration planner input facts are named.
- Fatal versus warning source conditions are explicit.
- No Git adapter calls enter domain code.
- The dry-run planner can be designed against inventory plus manifest.

## SSJS Scorecard

- Runtime-backed forms: green when inventory facts are named classes.
- Boundary validation: green when missing basis and duplicates fail closed.
- Behavior ownership: green when inventory owns source completeness rules.
- Message parsing: green; no text parsing.
- Ambient time or entropy: green; no ambient sources.
- Fake shape trust or cast-cosplay: green when no shape assertions appear.
