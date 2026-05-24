---
cycle: 0206
task_id: V18_command_reading_providers
status: Completed
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 58
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
---

# V18 Command Reading Providers

## Hill

Let the migration command construct equivalence readings after scratch writing
instead of requiring pre-built readings.

## Closeout

Slice 58 added command reading providers. The command still accepts explicit
readings for focused tests, but can now call a legacy provider and a
scratch-provider after scratch history exists.

## Verification

```text
npx vitest run test/unit/scripts/v18-migration-command.test.ts --reporter=verbose
```
