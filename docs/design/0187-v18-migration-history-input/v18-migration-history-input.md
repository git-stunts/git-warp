---
cycle: 0187
task_id: V18_migration_history_input
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
release_home: v18.0.0
bearing_task: 39
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
  - docs/method/backlog/v18.0.0/TRUST_genesis-replay-equivalence.md
---

# V18 Migration History Input

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Represent ordered legacy patch history as planner input, preserving writer,
patch identity, operation index, and frontier evidence for later equivalence.

## Playback Questions

- Does each legacy patch input record its writer identity?
- Does each patch input record stable patch identity and operation order?
- Does the input preserve enough frontier evidence for replay comparison?
- Are duplicate or out-of-order inputs rejected deterministically?
- Can the dry-run planner consume history without reading Git itself?

## Existing Shape

The migration manifest and source inventory can describe current state, but
genesis replay equivalence needs patch-boundary evidence. A state-only plan
cannot identify the first divergent patch. The migration input model needs
history as an explicit, ordered source.

## Chosen Boundary

Add migration history input nouns:

- legacy writer id;
- legacy patch id;
- operation index;
- patch operation fact;
- patch frontier or parent evidence;
- ordered history segment;
- complete history input.

The adapter later maps Git commits and patch journal entries into these
nouns. Domain planning and equivalence code consume only the nouns.

## Non-Goals

- Do not implement Git walking.
- Do not write migrated patch history.
- Do not serialize history input.
- Do not compare equivalence yet.
- Do not infer missing writer order from wall-clock timestamps.

## RED Plan

Add tests for history input:

- duplicate patch ids fail;
- operation indexes must be contiguous per patch;
- writer chain order must be deterministic;
- missing frontier evidence is fatal when equivalence requires it;
- history input is immutable.

## GREEN Plan

Implement focused classes under migration domain code. Use result values for
expected validation failures if construction has to aggregate multiple
problems; use domain errors only for impossible programmer mistakes.

The types should be small enough for the future divergence reporter to point
at exact patch and operation boundaries.

## Verification

```text
npx vitest run test/unit/domain/migrations/MigrationHistoryInput.test.ts --reporter=verbose
npx eslint src/domain/migrations test/unit/domain/migrations/MigrationHistoryInput.test.ts
npm run typecheck
npm run lint:sludge
git diff --check HEAD
```

## Closeout Criteria

- Ordered history input is a named migration source.
- Patch and operation boundaries are preserved.
- No adapter behavior leaks into domain code.
- The manifest serializer slice can focus on persistence boundaries.

## SSJS Scorecard

- Runtime-backed forms: green when history records are frozen classes.
- Boundary validation: green when duplicate and order checks fail closed.
- Behavior ownership: green when history input owns replay ordering facts.
- Message parsing: green; no message parsing.
- Ambient time or entropy: green; no timestamps or randomness.
- Fake shape trust or cast-cosplay: green when no assertions are added.
