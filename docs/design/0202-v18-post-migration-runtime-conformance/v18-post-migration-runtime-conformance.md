---
cycle: 0202
task_id: V18_post_migration_runtime_conformance
status: Completed
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 54
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
  - docs/method/backlog/v18.0.0/TRUST_genesis-replay-equivalence.md
---

# V18 Post-Migration Runtime Conformance

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Prevent finalization unless post-migration scratch output has explicit runtime
conformance evidence.

## Playback Questions

- Does finalization require conformance evidence in addition to equivalence?
- Does the conformance evidence name the scratch ref and head it covers?
- Does mismatched evidence fail closed?
- Does command wiring make the conformance provider explicit?
- Does the design avoid claiming scratch operation commits are runtime-readable
  before replay integration exists?

## Existing Shape

Slice 53 wired the command flow and could finalize supplied readings after a
passing equivalence gate. That was still not enough for a release-quality
migration path: equivalence over supplied readings is not the same as proving
that the finalized live ref is readable by the normal runtime.

## Chosen Boundary

Add runtime conformance as explicit evidence required by finalization safety.
The evidence includes:

- scratch ref;
- scratch head;
- pass/fail status;
- witness name;
- fatal errors for failed evidence.

The command accepts a conformance provider that receives the actual scratch
write result. Finalization safety rejects missing evidence and evidence that
does not match the scratch ref/head.

## Non-Goals

- Do not claim that scratch migration-operation commits are already complete
  runtime patch commits.
- Do not make finalization infer conformance from equivalence alone.
- Do not add a fake runtime adapter.
- Do not parse report text as proof.

## RED Plan

Add safety and command tests:

- finalization without runtime conformance is rejected;
- conformance for a different scratch head is rejected;
- command finalization supplies conformance through an explicit provider;
- divergent equivalence still blocks even when a conformance provider exists.

## GREEN Plan

Add `GraphModelMigrationRuntimeConformanceResult` and thread it through
`GraphModelMigrationFinalizationRequest`, `GraphModelMigrationFinalizationSafety`,
and `runGraphModelMigrationCommand`.

## Verification

```text
npx vitest run test/unit/domain/migrations/GraphModelMigrationFinalizationSafety.test.ts test/unit/scripts/v18-migration-finalizer.test.ts test/unit/scripts/v18-migration-command.test.ts --reporter=verbose
npx eslint --no-warn-ignored src/domain/migrations/GraphModelMigrationRuntimeConformanceResult.ts src/domain/migrations/GraphModelMigrationFinalizationRequest.ts src/domain/migrations/GraphModelMigrationFinalizationSafety.ts scripts/v18.0.0/migrations/graph-model/GraphModelMigrationCommand.ts test/unit/domain/migrations/GraphModelMigrationFinalizationSafety.test.ts test/unit/scripts/v18-migration-finalizer.test.ts test/unit/scripts/v18-migration-command.test.ts
npm run typecheck
```

## Closeout Criteria

- Runtime conformance evidence is required by finalization.
- Evidence must match the scratch ref and head.
- Command finalization receives conformance from an explicit provider.
- The remaining runtime replay gap is visible in docs and bearing.

## Closeout

Slice 54 added `GraphModelMigrationRuntimeConformanceResult` and made
finalization safety require matching runtime conformance evidence. This is a
release-safety improvement, not a claim that the migration-operation scratch
history is already a native runtime patch stream.

The next release-grade step is to replace test-supplied conformance providers
with a real runtime replay check over the finalized graph-model history.

## SSJS Scorecard

- Runtime-backed forms: green; conformance evidence is a named value.
- Boundary validation: green; finalization validates evidence before Git I/O.
- Behavior ownership: green; conformance evidence gates, finalizer mutates.
- Message parsing: green; witness strings are not parsed as behavior.
- Ambient time or entropy: green; no clocks or randomness.
- Fake shape trust or cast-cosplay: green; current gap is explicit.
