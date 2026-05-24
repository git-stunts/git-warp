---
cycle: 0198
task_id: V18_migration_finalization_safety
status: Completed
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 51
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
---

# V18 Migration Finalization Safety

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Specify and test the safe finalization protocol for promoting equivalence-
proven scratch migration output without rewriting history.

## Playback Questions

- Does finalization require an explicit operator confirmation token or
  equivalent non-accidental action?
- Does it preserve old lineage through archive refs rather than deletion?
- Does it refuse to run unless the scratch equivalence gate passed?
- Does it use compare-and-swap ref updates rather than force operations?
- Does it document rollback and audit evidence in BEARING/backlog before
  release work begins?

## Existing Shape

By this point, the tool should be able to collect real source inventory, lower
planned operations, write scratch migrated history, and gate scratch output
against equivalence. The remaining risk is finalization: changing live refs is
where migration can damage user data if the protocol is vague.

## Chosen Boundary

This slice should first design the finalization protocol and then add minimal
tests for the gate conditions:

- explicit confirmation;
- passed equivalence proof;
- archive ref target;
- live ref compare-and-swap;
- no force or rewrite path.

If implementation is not yet safe, the slice should stop at design and tests
that prove finalization remains locked.

## Non-Goals

- Do not run finalization without a prior equivalence gate.
- Do not force-update refs.
- Do not delete old lineage.
- Do not hide archive refs from operators.
- Do not bump release version.

## RED Plan

Add safety tests:

- finalization without confirmation is rejected;
- finalization without passed gate is rejected;
- archive target is required;
- stale live ref expectation fails closed;
- force mode does not exist.

## GREEN Plan

Implement only the smallest finalization surface that can satisfy the safety
tests. Prefer a locked design document over a write path if live-ref semantics
remain ambiguous.

## Verification

```text
npx vitest run test/unit/domain/migrations/GraphModelMigrationFinalizationSafety.test.ts --reporter=verbose
npm run typecheck
npm run lint:semgrep
npm run lint:sludge
git diff --check HEAD
```

## Closeout Criteria

- Finalization safety protocol is explicit.
- Archive and compare-and-swap behavior are named.
- No destructive defaults exist.
- v18 release readiness can be assessed from migration evidence.

## Closeout

Slice 51 implemented the finalization safety protocol as pure domain values,
not as live Git ref mutation. `GraphModelMigrationFinalizationRequest` names
the required finalization evidence: live ref, expected and observed live head,
scratch ref/head, archive ref target, operator confirmation, and equivalence
gate result.

`GraphModelMigrationFinalizationSafety` blocks finalization unless all of the
following are true:

- the live ref is under `refs/warp/*`;
- the explicit confirmation token is present;
- the scratch equivalence gate allows promotion;
- the archive ref is under `refs/warp-migration-archive/*`;
- scratch ref and scratch head evidence are present;
- the observed live head matches the expected live head.

No force switch exists on the request shape. Slice 52 can now implement the
Git update step against these preconditions instead of inventing its own
ad-hoc finalization rules.

## Verification Result

```text
npx vitest run test/unit/domain/migrations/GraphModelMigrationFinalizationSafety.test.ts --reporter=verbose
npx eslint --no-warn-ignored src/domain/migrations/GraphModelMigrationArchiveRef.ts src/domain/migrations/GraphModelMigrationFinalizationConfirmation.ts src/domain/migrations/GraphModelMigrationFinalizationRequest.ts src/domain/migrations/GraphModelMigrationFinalizationSafety.ts src/domain/migrations/GraphModelMigrationFinalizationSafetyResult.ts test/unit/domain/migrations/GraphModelMigrationFinalizationSafety.test.ts
npm run typecheck
npm run lint:sludge
npm run lint:semgrep
```

## SSJS Scorecard

- Runtime-backed forms: green; finalization request, confirmation, archive ref,
  and safety result are named values.
- Boundary validation: green; confirmation and gate proof are validated before
  Git mutation exists.
- Behavior ownership: green; safety only decides, later finalization finalizes.
- Message parsing: green; no confirmation through parsed prose.
- Ambient time or entropy: green; no clocks or randomness.
- Fake shape trust or cast-cosplay: green; ref outcomes and blockers are typed.
