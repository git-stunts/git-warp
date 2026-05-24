---
cycle: 0195
task_id: V18_migration_operation_lowering
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
release_home: v18.0.0
bearing_task: 48
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
---

# V18 Migration Operation Lowering

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Define runtime-backed lowering from dry-run planned graph operations to
write-ready migrated graph-operation facts without committing them.

## Playback Questions

- Does lowering consume `DryRunGraphModelMigrationPlan` rather than re-reading
  legacy property maps?
- Are node, edge, property, and content attachment operations represented as
  explicit lowered facts?
- Does lowering reject fatal dry-run plans?
- Does output ordering remain deterministic?
- Does the slice stop before writing commits or updating refs?

## Existing Shape

The dry-run planner emits `GraphModelMigrationPlannedGraphOperation` facts.
Those facts describe intended graph-model operations but are not yet write
instructions. The next write-capable branch needs a bridge that makes the
future write shape explicit while staying non-destructive.

## Chosen Boundary

Add lowering nouns under `src/domain/migrations/`:

- lowered migration operation;
- lowered migration patch plan;
- lowering result or failure;
- lowering service over successful dry-run plans.

Lowering should preserve source/target keys and operation kind, but it should
not call Git, allocate refs, or serialize commit messages.

## Non-Goals

- Do not implement scratch writing.
- Do not change `PatchBuilder` or live graph write APIs.
- Do not archive source history.
- Do not run equivalence against scratch history yet.
- Do not add transport JSON unless the next adapter needs it.

## RED Plan

Add lowering tests:

- successful dry-run plan lowers into deterministic operation facts;
- fatal dry-run plan returns or throws a validation failure before lowering;
- property target keys preserve length-prefixed identity;
- content attachment operations preserve manifest content mappings;
- repeated lowering output is stable.

## GREEN Plan

Implement lowering as pure domain code. Use `instanceof` checks and explicit
classes; do not model lowered operations as generic object dictionaries.

## Verification

```text
npx vitest run test/unit/domain/migrations/GraphModelMigrationOperationLowering.test.ts --reporter=verbose
npx eslint src/domain/migrations test/unit/domain/migrations/GraphModelMigrationOperationLowering.test.ts
npm run typecheck
npm run lint:semgrep
git diff --check HEAD
```

## Closeout Criteria

- Lowering vocabulary is runtime-backed.
- Lowering consumes dry-run plan values.
- No graph-history writes are added.
- Scratch writer work has explicit input values.

## SSJS Scorecard

- Runtime-backed forms: green when lowered operation facts are classes.
- Boundary validation: green when fatal plans cannot be lowered.
- Behavior ownership: green when lowering owns operation translation.
- Message parsing: green; no diagnostic parsing.
- Ambient time or entropy: green; no clocks or randomness.
- Fake shape trust or cast-cosplay: green when no assertions are introduced.
