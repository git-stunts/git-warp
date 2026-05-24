---
cycle: 0201
task_id: V18_migration_command_wiring
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 53
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
---

# V18 Migration Command Wiring

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Wire the v18 graph-model migration steps into one command-level flow while
keeping finalization explicit and gated.

## Playback Questions

- Does the command run dry-run planning, lowering, scratch writing, and
  equivalence in order?
- Does it remain non-finalizing by default?
- Does finalization require explicit finalization options and confirmation?
- Does failed equivalence prevent archive/live ref updates?
- Does the command expose enough typed result evidence for CLI formatting?

## Existing Shape

Slices 46 through 52 created fixture restore, source inventory, operation
lowering, scratch writing, equivalence gating, finalization safety, and
archive-preserving finalization. The missing step was a command-level
orchestrator that puts those pieces in the right order.

## Chosen Boundary

Add a script-level command runner under
`scripts/v18.0.0/migrations/graph-model/`. It accepts typed request and
reading values rather than parsing command-line text. The existing dry-run CLI
remains non-destructive; a broader user-facing parser can wrap this runner
later.

The command runner:

1. plans a dry-run migration;
2. lowers successful plans;
3. writes scratch history;
4. gates supplied legacy/scratch readings;
5. optionally builds finalization safety and calls the finalizer.

## Non-Goals

- Do not infer legacy or scratch readings from Git in this slice.
- Do not add a broad operator CLI parser.
- Do not finalize without explicit finalization options.
- Do not skip the equivalence gate.
- Do not claim post-migration runtime conformance.

## RED Plan

Add command tests:

- default run writes scratch history and does not finalize;
- explicit finalization archives and advances live refs after passing gate;
- divergent supplied readings block finalization and leave live refs intact.

## GREEN Plan

Keep orchestration thin. Reuse the existing planner, lowerer, scratch writer,
equivalence gate, finalization safety gate, and finalizer instead of creating
parallel command-local checks.

## Verification

```text
npx vitest run test/unit/scripts/v18-migration-command.test.ts --reporter=verbose
npx eslint --no-warn-ignored scripts/v18.0.0/migrations/graph-model/GraphModelMigrationCommand.ts test/unit/scripts/v18-migration-command.test.ts
npm run typecheck
```

## Closeout Criteria

- The command flow is ordered.
- Default operation is non-finalizing.
- Explicit finalization uses the safety/finalizer path.
- Failed equivalence blocks live ref changes.

## Closeout

Slice 53 added `runGraphModelMigrationCommand`. The command runner wires
dry-run planning, operation lowering, scratch writing, equivalence gating, and
optional finalization. Finalization is absent by default and only runs when
explicit finalization options are supplied.

The runner still consumes supplied legacy and scratch readings. Real-history
reading construction remains the next proof gap before public release.

## SSJS Scorecard

- Runtime-backed forms: green; command result carries named stage results.
- Boundary validation: green; typed values cross the command boundary.
- Behavior ownership: green; orchestration orders existing services.
- Message parsing: green; no command behavior parses formatted output.
- Ambient time or entropy: green; command does not create identities.
- Fake shape trust or cast-cosplay: green; tests use real Git refs.
