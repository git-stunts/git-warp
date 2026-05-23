---
cycle: 0186
task_id: V18_dry_run_state_migration_planner
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
release_home: v18.0.0
bearing_task: 38
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
---

# V18 Dry-Run State Migration Planner

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Create a dry-run migration planner that turns source inventory into a planned
manifest and graph-op algebra facts without writing graph history.

## Playback Questions

- Does the planner run without touching Git refs?
- Does it produce a migration manifest root?
- Does it use graph-op algebra and projection records rather than raw state
  maps?
- Does it fail closed on incomplete source inventory?
- Does it report what would be written before any writer exists?

## Existing Shape

Once property projection is complete, the repo has enough read-model structure
to plan a graph-model migration. It still should not write migrated history.
The first planner must be dry-run only so equivalence can be designed and
tested before history emission.

## Chosen Boundary

The planner consumes a source inventory and current projection services. It
emits:

- a migration manifest;
- planned graph-op algebra facts;
- warnings;
- fatal planning failures;
- summary counts suitable for CLI display later.

The planner is pure domain code. It must not read files, shell out, inspect
environment variables, or create timestamps.

## Non-Goals

- Do not write migrated commits.
- Do not archive old lineage.
- Do not serialize the manifest.
- Do not implement a CLI.
- Do not claim equivalence proof.

## RED Plan

Add tests that fail before the planner exists:

- complete inventory yields a manifest and planned graph-op facts;
- missing content source yields a fatal planning failure;
- malformed property facts cannot enter planned graph-op output;
- planner output is deterministic across repeated runs.

## GREEN Plan

Implement the planner as a domain service with explicit input and output
types. The output should be a result value, not an exception path for expected
planning failures.

If planned graph-op facts need a distinct type from live graph-op algebra,
create a named type rather than reusing a shape that lies about origin.

## Verification

```text
npx vitest run test/unit/domain/migrations/DryRunGraphModelMigrationPlanner.test.ts --reporter=verbose
npx eslint src/domain/migrations test/unit/domain/migrations/DryRunGraphModelMigrationPlanner.test.ts
npm run typecheck
npm run lint
npm run lint:sludge
git diff --check HEAD
```

## Closeout Criteria

- Dry-run planner exists and writes nothing.
- Planner output includes manifest, facts, warnings, and failures.
- Expected planning failures are returned as values.
- The next slice can feed ordered patch history into the inventory.

## SSJS Scorecard

- Runtime-backed forms: green when planner input and output are named.
- Boundary validation: green when incomplete inventory fails closed.
- Behavior ownership: green when planner owns planning, not collection.
- Message parsing: green; no message-text branching.
- Ambient time or entropy: green; no clocks, env reads, or randomness.
- Fake shape trust or cast-cosplay: green when no assertions are introduced.
