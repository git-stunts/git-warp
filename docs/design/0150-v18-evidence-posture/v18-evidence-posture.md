---
cycle: 0150
task_id: V18_evidence_posture
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-21
completed_at: 2026-05-21
release_home: v18.0.0
---

# V18 Evidence Posture

## Pull

The generated-artifact seam can now admit Continuum-family descriptors, but
the next compatibility cut must prevent a projected value from pretending to
carry a separate Continuum witness reference.

## Hill

`git-warp` has a runtime-backed evidence status that separates participant
runtime evidence from Continuum-witnessed evidence and requires an explicit
Continuum witness reference before witnessed evidence can be claimed.

## Playback Questions

Agent:

- Does git-warp participant evidence carry an explicit participant-runtime
  posture?
- Does Continuum-witnessed evidence require a witness reference?
- Does the model reject participant-runtime evidence that tries to smuggle in a
  Continuum witness reference?

Human:

- Can later v18 receipt projections say "this is git-warp participant evidence
  projected into a Continuum-family shape" without overclaiming?

## Accessibility / Assistive Reading Posture

The evidence status is plain data with stable string fields. No visual-only
state is introduced.

## Localization / Directionality Posture

The posture values are protocol identifiers and not localized prose. Human
summaries remain ordinary strings supplied by callers.

## Agent Inspectability / Explainability Posture

The status object exposes posture, source runtime, basis reference, optional
Continuum witness reference, and summary as inspectable fields.

## Non-Goals

- Do not implement Continuum witness production.
- Do not generate receipt-family values in this slice.
- Do not build a generic WARP Optic engine.

## RED

Expected failing spec:

```text
npx vitest run test/unit/domain/continuum/ContinuumEvidenceStatus.test.ts
```

Observed RED:

```text
Error: Cannot find module '../../../../src/domain/continuum/ContinuumEvidencePosture.ts'
```

## GREEN

This slice adds:

- `ContinuumEvidencePosture`
- `ContinuumEvidenceStatus`

Git-warp participant evidence is represented as `participant-runtime` with
`sourceRuntime: "git-warp"`. Continuum-witnessed evidence is represented as
`continuum-witnessed` and cannot be constructed unless `continuumWitnessRef` is
present. Participant-runtime evidence rejects `continuumWitnessRef` so
compatibility output cannot smuggle witnesshood through an optional field.

## Playback

Witness:

```text
npx vitest run test/unit/domain/continuum/ContinuumEvidenceStatus.test.ts test/unit/domain/index.exports.test.ts
Test Files  2 passed (2)
Tests       55 passed (55)

npm run typecheck:src -- --pretty false
```

Agent answers:

- Yes, git-warp participant evidence carries explicit participant-runtime
  posture.
- Yes, Continuum-witnessed evidence requires `continuumWitnessRef`.
- Yes, participant-runtime evidence with `continuumWitnessRef` is rejected.

Human answer:

- Later receipt-family projections can carry git-warp participant evidence
  without claiming separate Continuum witnesshood.

## SSJS Scorecard

- Runtime-backed forms: green; both new concepts are classes with constructor
  validation and frozen instances.
- Boundary validation: green; no raw boundary parsing was introduced.
- Behavior ownership: green; posture validation and evidence-status invariants
  live on the evidence concepts.
- Message parsing: green; no message parsing introduced.
- Ambient time or entropy: green; no ambient time or entropy introduced.
- Fake shape trust or cast-cosplay: green; Continuum-witnessed evidence cannot
  be claimed without an explicit witness reference.

## Closeout

This closes BEARING task 6 and gives receipt-family projection work an honest
evidence-status carrier.
