---
cycle: 0196
task_id: V18_scratch_migration_writer
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

The dry-run path can now plan and prove fixture-level equivalence. Slice 47
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

## SSJS Scorecard

- Runtime-backed forms: green when writer results are named values.
- Boundary validation: green when scratch targets are validated before I/O.
- Behavior ownership: green when writer writes and domain lowering lowers.
- Message parsing: green; no behavior parses text output.
- Ambient time or entropy: green when generated identities come from inputs or
  injected ports.
- Fake shape trust or cast-cosplay: green when fake persistence is typed.
