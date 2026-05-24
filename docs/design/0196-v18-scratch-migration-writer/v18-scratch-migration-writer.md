---
cycle: 0196
task_id: V18_scratch_migration_writer
status: Completed
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 49
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
---

# V18 Scratch Migration Writer

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Write lowered migration operations only to an explicit scratch target so
equivalence can inspect migrated history before any live ref changes.

## Playback Questions

- Does the writer require an explicit scratch namespace or isolated target?
- Does it reject live writer refs and default production locations?
- Does it write a manifest sidecar or return manifest identity for inspection?
- Does it preserve append-only Git safety with no force, rebase, or history
  rewrite behavior?
- Does it remain blocked from finalization until equivalence passes?

## Existing Shape

The dry-run path can now plan and prove fixture-level equivalence. Slice 48
will define lowered operation facts. The first write-capable step must be a
scratch writer, not a live migration command.

## Chosen Boundary

Add a script or adapter-layer writer that accepts lowered operation facts and
an explicit scratch destination. It may create scratch refs or write to an
isolated repository target, but it must never replace live graph writer refs.

The scratch writer should return a structured result with:

- scratch namespace or target;
- written patch identifiers;
- manifest artifact location or identity;
- warnings and fatal failures.

## Non-Goals

- Do not archive old lineages.
- Do not promote scratch refs to live refs.
- Do not run final equivalence gate inside the writer unless already
  available as a dependency.
- Do not accept implicit current-directory production defaults.
- Do not add destructive cleanup.

## RED Plan

Add writer tests:

- explicit scratch target receives migrated patch facts;
- missing scratch target fails before writing;
- live writer ref targets are rejected;
- manifest sidecar is produced deterministically;
- fake persistence records no live-ref update calls.

## GREEN Plan

Keep the writer adapter-facing and narrow. If existing persistence ports are
too broad, use a scratch-writer-specific port for tests and adapt production
persistence behind it.

## Verification

```text
npx vitest run test/unit/scripts/v18-scratch-migration-writer.test.ts --reporter=verbose
npm run typecheck
npm run lint:semgrep
npm run lint:sludge
git diff --check HEAD
```

## Closeout Criteria

- Scratch migration writing exists behind explicit target selection.
- No live refs are changed by default or by accident.
- Scratch output can be replayed by the equivalence gate.
- Finalization remains separate.

## Closeout

Slice 49 added the first write-capable v18 graph-model migration step, fenced
behind `GraphModelMigrationScratchRef`. The writer accepts lowered migration
operations and writes one deterministic Git commit per operation to an
explicit `refs/warp-migration-scratch/*` ref.

The implementation rejects missing targets, live `refs/warp/*` targets, and
invalid scratch ref shapes before writing. Scratch ref advancement uses
`git update-ref` with the expected old head, so appending remains CAS-shaped
instead of force-shaped. Commit payloads encode operation and basis identity
as UTF-8 hex lines rather than JSON, keeping serialization out of the domain
and avoiding behaviorally significant message parsing.

Finalization is still not present. The scratch history is now inspectable
input for the slice 50 equivalence gate.

## Verification Result

```text
npx vitest run test/unit/scripts/v18-scratch-migration-writer.test.ts --reporter=verbose
npx eslint --no-warn-ignored scripts/v18.0.0/migrations/graph-model/GraphModelMigrationScratchWriter.ts test/unit/scripts/v18-scratch-migration-writer.test.ts src/domain/migrations/GraphModelMigrationScratchRef.ts src/domain/migrations/GraphModelMigrationScratchWrittenPatch.ts src/domain/migrations/GraphModelMigrationScratchWriteResult.ts
npm run typecheck
```

## SSJS Scorecard

- Runtime-backed forms: green; scratch refs, written patches, and write
  results are named values.
- Boundary validation: green; scratch targets are validated before write I/O.
- Behavior ownership: green; writer writes and domain lowering lowers.
- Message parsing: green; no behavior parses text output.
- Ambient time or entropy: green; scratch commits use fixed migration Git
  identity and dates.
- Fake shape trust or cast-cosplay: green; tests use real Git repositories and
  typed result values.
