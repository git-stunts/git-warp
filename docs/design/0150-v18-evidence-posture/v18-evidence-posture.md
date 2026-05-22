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
the next compatibility cut must prevent a shaped value from pretending to be a
native Continuum witness.

## Hill

`git-warp` has a runtime-backed evidence status that separates translated
substrate evidence from native Continuum evidence and requires a native witness
reference before native evidence can be claimed.

## Playback Questions

Agent:

- Does translated git-warp evidence carry an explicit translated posture?
- Does native Continuum evidence require a native witness reference?
- Does the model reject translated evidence that tries to smuggle in a native
  witness reference?

Human:

- Can later v18 receipt projections say "this is git-warp evidence translated
  into a Continuum-family shape" without overclaiming?

## Accessibility / Assistive Reading Posture

The evidence status is plain data with stable string fields. No visual-only
state is introduced.

## Localization / Directionality Posture

The posture values are protocol identifiers and not localized prose. Human
summaries remain ordinary strings supplied by callers.

## Agent Inspectability / Explainability Posture

The status object exposes posture, source runtime, basis reference, optional
native witness reference, and summary as inspectable fields.

## Non-Goals

- Do not implement native Continuum witness production.
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

Translated git-warp evidence is represented as `translated-substrate` with
`sourceRuntime: "git-warp"`. Native Continuum evidence is represented as
`continuum-native` and cannot be constructed unless `nativeWitnessRef` is
present. Translated evidence rejects `nativeWitnessRef` so compatibility output
cannot smuggle native witnesshood through an optional field.

## Playback

Witness:

```text
npx vitest run test/unit/domain/continuum/ContinuumEvidenceStatus.test.ts test/unit/domain/index.exports.test.ts
Test Files  2 passed (2)
Tests       55 passed (55)

npm run typecheck:src -- --pretty false
```

Agent answers:

- Yes, translated git-warp evidence carries explicit translated posture.
- Yes, native Continuum evidence requires `nativeWitnessRef`.
- Yes, translated evidence with `nativeWitnessRef` is rejected.

Human answer:

- Later receipt-family projections can carry translated git-warp evidence
  without claiming native Continuum witnesshood.

## SSJS Scorecard

- Runtime-backed forms: green; both new concepts are classes with constructor
  validation and frozen instances.
- Boundary validation: green; no raw boundary parsing was introduced.
- Behavior ownership: green; posture validation and evidence-status invariants
  live on the evidence concepts.
- Message parsing: green; no message parsing introduced.
- Ambient time or entropy: green; no ambient time or entropy introduced.
- Fake shape trust or cast-cosplay: green; native evidence cannot be claimed
  without an explicit native witness reference.

## Closeout

This closes BEARING task 6 and gives receipt-family projection work an honest
evidence-status carrier.
