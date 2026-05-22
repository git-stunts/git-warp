---
cycle: 0150
task_id: V18_evidence_posture
status: Complete
sponsors:
  human: James
  agent: Codex
completed_at: 2026-05-21
---

# Retro: V18 Evidence Posture

## Hill

`git-warp` has a runtime-backed evidence status that separates translated
substrate evidence from native Continuum evidence and requires a native witness
reference before native evidence can be claimed.

## Result

Hill met.

## Witness

```text
npx vitest run test/unit/domain/continuum/ContinuumEvidenceStatus.test.ts test/unit/domain/index.exports.test.ts
Test Files  2 passed (2)
Tests       55 passed (55)

npm run typecheck:src -- --pretty false
```

## Drift Check

No drift. The implementation stayed within the evidence-posture slice and did
not start receipt-family projection or native witness production.

## What Mess We Got Into

The repo had a generated-artifact gate but no runtime object for the more
dangerous claim: whether a Continuum-shaped value is native evidence or merely
translated substrate evidence.

## What Mess We Got Out Of

Native Continuum evidence now has to carry `nativeWitnessRef`. Translated
git-warp evidence is the explicit default and cannot include that native
witness field.

## What Comes Next

Prove that patch commit success means canonical writer-tip advancement and
visible graph truth, then use that proven source fact for receipt-family
projection.
