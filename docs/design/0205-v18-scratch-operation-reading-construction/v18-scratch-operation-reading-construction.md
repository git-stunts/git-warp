---
cycle: 0205
task_id: V18_scratch_operation_reading_construction
status: Completed
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 57
promotes_backlog:
  - docs/method/backlog/v18.0.0/TRUST_genesis-replay-equivalence.md
---

# V18 Scratch Operation Reading Construction

## Hill

Build `GenesisEquivalenceReading` values from scratch migration operation
commits.

## Chosen Boundary

`GraphModelMigrationScratchReadingBuilder` is a script-layer Git adapter. It
reads `migration-operation.txt` from scratch commits and projects operation
facts into equivalence facts with scratch commit boundary evidence.

## Closeout

Slice 57 removes another hand-authored test fixture dependency. The builder is
still operation-derived; it is not yet normal runtime replay over native graph
history.

## Verification

```text
npx vitest run test/unit/scripts/v18-scratch-reading-builder.test.ts --reporter=verbose
```
