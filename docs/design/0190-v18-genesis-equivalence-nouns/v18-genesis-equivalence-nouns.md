---
cycle: 0190
task_id: V18_genesis_equivalence_nouns
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
release_home: v18.0.0
bearing_task: 42
promotes_backlog:
  - docs/method/backlog/v18.0.0/TRUST_genesis-replay-equivalence.md
---

# V18 Genesis Equivalence Nouns

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Define runtime-backed equivalence proof nouns for comparing legacy replay and
planned migrated replay from genesis.

## Playback Questions

- Is an equivalence proof a named result value?
- Are legacy and migrated readings represented separately?
- Are mismatches structured by patch, operation, field, and value?
- Does equality include node, edge, property, content, and attachment facts?
- Can proof failure identify a boundary without throwing expected errors?

## Existing Shape

Migration planning can produce a manifest and planned facts, but trust comes
from replay equivalence. The backlog requires comparing migrated history from
genesis with legacy history to the migration cut, including node, edge,
payload, and reading participation.

Before building the harness, the proof vocabulary must be explicit.

## Chosen Boundary

Add equivalence domain nouns:

- legacy replay reading;
- migrated replay reading;
- equivalence comparison basis;
- equivalence mismatch;
- equivalence success result;
- equivalence failure result;
- proof summary.

These nouns should be pure domain values. They can compare values supplied by
replay harnesses, but they must not run Git or materialize graphs themselves.

## Non-Goals

- Do not build fixtures yet.
- Do not implement full replay.
- Do not write migrated history.
- Do not serialize proof output yet unless needed by tests.
- Do not compare only state hashes; structured mismatch evidence is required.

## RED Plan

Add tests that fail until proof nouns exist:

- equal legacy and migrated readings yield success;
- node mismatch yields a structured mismatch;
- content attachment mismatch identifies the content field;
- multiple mismatches are collected deterministically;
- expected proof failure is returned as a value.

## GREEN Plan

Implement proof nouns with immutable collections and deterministic ordering.
Use explicit comparison methods or a proof service that consumes readings and
returns result values.

Avoid a generic deep-equality helper as the proof model. The proof must know
which graph facts it is comparing.

## Verification

```text
npx vitest run test/unit/domain/migrations/GenesisEquivalenceProof.test.ts --reporter=verbose
npx eslint src/domain/migrations test/unit/domain/migrations/GenesisEquivalenceProof.test.ts
npm run typecheck
npm run lint:sludge
git diff --check HEAD
```

## Playback

- `GenesisEquivalenceComparisonBasis` names the legacy/migrated basis pair.
- `GenesisEquivalenceReading` and `GenesisEquivalenceReadingFact` represent
  observer-visible graph facts for legacy and migrated replay outputs.
- `GenesisEquivalenceBoundary` records writer, patch, and operation boundary
  evidence when a fact can be traced to a patch operation.
- `GenesisEquivalenceMismatch` distinguishes missing, extra, and changed
  facts with structured legacy/migrated values.
- `GenesisEquivalenceProofSuccess` and `GenesisEquivalenceProofFailure`
  return expected proof outcomes as values.

## Evidence

- `src/domain/migrations/GenesisEquivalenceProof.ts`
- `src/domain/migrations/GenesisEquivalenceReading.ts`
- `src/domain/migrations/GenesisEquivalenceReadingFact.ts`
- `src/domain/migrations/GenesisEquivalenceMismatch.ts`
- `src/domain/migrations/GenesisEquivalenceProofSuccess.ts`
- `src/domain/migrations/GenesisEquivalenceProofFailure.ts`
- `test/unit/domain/migrations/GenesisEquivalenceProof.test.ts`

## Closeout Criteria

- Equivalence proof vocabulary is runtime-backed.
- Mismatches are structured and deterministic.
- Proof result distinguishes success from expected failure.
- Fixture replay can target these nouns in the next slice.

## SSJS Scorecard

- Runtime-backed forms: green when proof and mismatch records are classes.
- Boundary validation: green when comparison inputs are validated readings.
- Behavior ownership: green when proof logic owns comparison semantics.
- Message parsing: green; no diagnostic parsing.
- Ambient time or entropy: green; no clocks or randomness.
- Fake shape trust or cast-cosplay: green when no assertions are introduced.
