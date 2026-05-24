---
cycle: 0197
task_id: V18_scratch_equivalence_gate
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
release_home: v18.0.0
bearing_task: 49
promotes_backlog:
  - docs/method/backlog/v18.0.0/TRUST_genesis-replay-equivalence.md
---

# V18 Scratch Equivalence Gate

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Run genesis replay equivalence against scratch migrated history and block
promotion when divergence is reported.

## Playback Questions

- Does the gate replay legacy history and scratch migrated history from
  genesis or explicit basis roots?
- Does it compare node, edge, property, content, and attachment facts through
  `GenesisEquivalenceProof`?
- Does failure return `GenesisDivergenceReport` output instead of stack traces?
- Does the migration command refuse finalization when the gate fails?
- Does passing the gate produce stable proof summary evidence?

## Existing Shape

Slice 42 created equivalence proof nouns, slice 43 created fixtures, and slice
44 created divergence reporting. Slice 48 will create scratch migrated history.
The next trust step is a gate over real scratch output.

## Chosen Boundary

Add an equivalence gate service that consumes:

- legacy replay reading;
- scratch migrated replay reading;
- comparison basis;
- optional scratch writer result metadata.

It returns success/failure proof values and a divergence report for failure.
CLI or script output may format the report, but gate decisions remain
structured values.

## Non-Goals

- Do not promote scratch history.
- Do not archive old lineages.
- Do not compare only state hashes.
- Do not hide content attachment mismatches behind property views.
- Do not make fixture-only proof claims.

## RED Plan

Add gate tests:

- equal scratch and legacy readings pass;
- changed property/content facts fail with divergence report;
- missing boundary evidence is explicit;
- migration finalization is blocked when proof fails;
- summary evidence is deterministic.

## GREEN Plan

Wire existing proof nouns and reporter into a gate value/service. Keep replay
input construction separate so future source collectors can evolve without
changing proof semantics.

## Verification

```text
npx vitest run test/unit/domain/migrations/GenesisEquivalenceGate.test.ts --reporter=verbose
npx eslint src/domain/migrations test/unit/domain/migrations/GenesisEquivalenceGate.test.ts
npm run typecheck
npm run lint:semgrep
git diff --check HEAD
```

## Closeout Criteria

- Scratch migration output is gated by genesis equivalence.
- Divergence blocks promotion.
- Passing proof summary is deterministic.
- Finalization design has enough evidence to specify promotion semantics.

## SSJS Scorecard

- Runtime-backed forms: green when gate outcomes are named values.
- Boundary validation: green when readings are proof nouns before comparison.
- Behavior ownership: green when proof code compares and gate code gates.
- Message parsing: green; report text is never parsed as behavior.
- Ambient time or entropy: green; no clocks or randomness.
- Fake shape trust or cast-cosplay: green when no assertions are introduced.
