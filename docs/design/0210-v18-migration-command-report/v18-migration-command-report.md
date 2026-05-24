---
cycle: 0210
task_id: V18_migration_command_report
status: Completed
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 62
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
---

# V18 Migration Command Report

## Hill

Give operators deterministic text output for the migration command's planning,
scratch, equivalence, and finalization evidence.

## Closeout

Slice 62 added `formatGraphModelMigrationCommandReport`. The report emits
stage status, operation counts, scratch ref/head evidence, equivalence fact
counts, finalization ref evidence, and fatal notice codes/messages.

## Verification

```text
npx vitest run test/unit/scripts/v18-migration-command.test.ts --reporter=verbose
```
