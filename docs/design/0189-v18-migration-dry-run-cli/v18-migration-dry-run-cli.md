---
cycle: 0189
task_id: V18_migration_dry_run_cli
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
release_home: v18.0.0
bearing_task: 41
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
---

# V18 Migration Dry-Run CLI

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Add a dry-run operator entry point for graph-model migration planning that
collects source facts, emits a manifest, and writes no graph history.

## Playback Questions

- Does the CLI live under the v18 migration script path?
- Does it default to dry-run and refuse destructive writes?
- Does it emit manifest and summary output deterministically?
- Does it fail closed when source inventory is incomplete?
- Does it avoid changing Git refs, graph data, or package state?

## Existing Shape

The repo has v17 migration scripts, but no v18 graph-model migration path.
The backlog asks for a script under a v18 migration directory. The first CLI
must be non-destructive so operators and CI can inspect planned migration
facts before equivalence proof exists.

## Chosen Boundary

Create a script entry point under a path such as:

```text
scripts/v18.0.0/migrations/graph-model/
```

The CLI should:

- collect source inventory through existing ports or adapters;
- call the dry-run planner;
- serialize the manifest through the adapter serializer;
- print summary counts and fatal issues;
- exit non-zero on fatal planning failure;
- never update refs or write migrated commits.

If an output file flag is supported, it may write only the manifest artifact,
not graph history.

## Non-Goals

- Do not implement an apply or commit mode.
- Do not archive old lineage.
- Do not update package versions.
- Do not require network access.
- Do not use unchecked `process.env` outside script or adapter boundaries.

## RED Plan

Add CLI tests or script-level tests:

- dry-run succeeds for a small fixture and emits a manifest;
- missing source graph fails non-zero with a structured failure;
- no Git ref update command is invoked;
- output is deterministic for repeated fixture runs.

## GREEN Plan

Wire the CLI to existing migration domain services and adapter serializers.
Keep script orchestration small enough to stay under source-size policy. Split
collection, planning, and reporting into named files if needed.

Use explicit command options. Avoid hidden defaults that could point at a
real graph without operator intent.

## Verification

```text
npx vitest run test/unit/scripts/v18GraphModelMigrationDryRun.test.ts --reporter=verbose
npx eslint scripts/v18.0.0/migrations/graph-model test/unit/scripts/v18GraphModelMigrationDryRun.test.ts
npm run typecheck
npm run lint
git diff --check HEAD
```

## Closeout Criteria

- Dry-run CLI exists and writes no graph history.
- Fixture dry-run emits a deterministic manifest.
- Fatal planning errors produce non-zero exit.
- The next slice can build equivalence nouns against CLI output.

## SSJS Scorecard

- Runtime-backed forms: green when CLI output comes from manifest nouns.
- Boundary validation: green when command options and source facts are
  validated before planning.
- Behavior ownership: green when CLI orchestrates but domain plans.
- Message parsing: green; behavior does not parse diagnostic strings.
- Ambient time or entropy: green; no timestamps in deterministic output.
- Fake shape trust or cast-cosplay: green when no unchecked shape assertions
  are introduced.
