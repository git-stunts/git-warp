---
cycle: 0211
task_id: V18_migration_command_cli_wrapper
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 63
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
---

# V18 Migration Command CLI Wrapper

## Hill

Expose the wired migration command through a narrow operator CLI without
opening live-ref finalization from shell flags.

## Closeout

Slice 63 added `migrate.ts` and `GraphModelMigrationCommandCli`. The wrapper
requires an explicit repository, request JSON, v17 fixture manifest, and
scratch ref. It writes scratch history, constructs command-owned legacy and
scratch readings, emits the deterministic command report, and refuses
finalization flags until live-ref CLI finalization has its own design.

## Verification

```text
npx vitest run test/unit/scripts/v18-graph-model-migration-command-cli.test.ts --reporter=verbose
```
