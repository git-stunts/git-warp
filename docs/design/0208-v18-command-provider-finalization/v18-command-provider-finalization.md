---
cycle: 0208
task_id: V18_command_provider_finalization
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 60
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
---

# V18 Command Provider Finalization

## Hill

Prove the command can finalize with command-owned readings and real scratch
operation readback evidence instead of test-supplied finalization proof.

## Closeout

Slice 60 changed the command finalization regression to run with a legacy
reading provider, a scratch reading provider, and the scratch runtime
conformance provider. The live ref moves only after those providers produce
passing equivalence and matching scratch runtime evidence.

## Verification

```text
npx vitest run test/unit/scripts/v18-migration-command.test.ts --reporter=verbose
```
