---
cycle: 0200
task_id: V18_migration_finalization_implementation
status: Completed
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 52
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
---

# V18 Migration Finalization Implementation

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Implement the archive-preserving live-ref update step for safety-approved
scratch migration output.

## Playback Questions

- Does finalization refuse to run when the safety gate is not green?
- Does it create an archive ref before changing the live ref?
- Does it reject pre-existing archive refs instead of overwriting them?
- Does it compare the live ref with the expected head immediately before
  archive creation?
- Does it advance the live ref with compare-and-swap, never force?

## Existing Shape

Slice 51 named finalization preconditions in pure domain values. The next
step can mutate Git refs only after receiving a passed
`GraphModelMigrationFinalizationSafetyResult`.

## Chosen Boundary

Add an adapter-layer finalizer under
`scripts/v18.0.0/migrations/graph-model/`. The finalizer receives an explicit
repository path and a safety result. If the safety result blocks
finalization, it returns a blocked result without touching Git.

For approved finalization:

1. Re-read the live ref and require it to match the expected head.
2. Require the archive ref to be absent.
3. Create the archive ref with `git update-ref <archive> <old> <zero>`.
4. Advance the live ref with `git update-ref <live> <scratch> <old>`.

## Non-Goals

- Do not infer safety from command-line flags.
- Do not force-update refs.
- Do not delete old lineage.
- Do not implement the end-to-end command in this slice.
- Do not claim migrated runtime conformance yet.

## RED Plan

Add finalizer tests:

- approved safety archives old live head and advances live ref;
- failed safety leaves archive and live refs untouched;
- existing archive ref blocks finalization;
- live-ref drift blocks before archive creation.

## GREEN Plan

Share a shell-free Git command runner with the scratch writer, then implement
the finalizer as a narrow adapter over `git update-ref`.

## Verification

```text
npx vitest run test/unit/scripts/v18-migration-finalizer.test.ts test/unit/scripts/v18-scratch-migration-writer.test.ts --reporter=verbose
npx eslint --no-warn-ignored scripts/v18.0.0/migrations/graph-model/GitMigrationCommandRunner.ts scripts/v18.0.0/migrations/graph-model/GraphModelMigrationFinalizer.ts scripts/v18.0.0/migrations/graph-model/GraphModelMigrationScratchWriter.ts src/domain/migrations/GraphModelMigrationFinalizationResult.ts test/unit/scripts/v18-migration-finalizer.test.ts test/unit/scripts/v18-scratch-migration-writer.test.ts
npm run typecheck
npm run lint:sludge
npm run lint:semgrep
```

## Closeout Criteria

- Archive ref creation is covered.
- Live ref advancement is covered.
- Stale live ref expectations are covered.
- No force or delete path exists.

## Closeout

Slice 52 added `GraphModelMigrationFinalizationResult` and
`finalizeGraphModelMigration`. The finalizer short-circuits blocked safety
results, rejects live-ref drift before archive creation, rejects existing
archive refs, creates the archive ref with a zero-old compare-and-swap, and
advances the live ref with expected-head compare-and-swap.

The scratch writer now shares `GitMigrationCommandRunner` with the finalizer,
keeping Git subprocess execution shell-free and centralized for the v18
migration scripts.

## SSJS Scorecard

- Runtime-backed forms: green; finalization result status is a named union.
- Boundary validation: green; only safety-approved requests can mutate refs.
- Behavior ownership: green; finalizer mutates refs and safety decides safety.
- Message parsing: green; no behavior parses prose output.
- Ambient time or entropy: green; finalizer does not create commits.
- Fake shape trust or cast-cosplay: green; tests use real Git refs.
