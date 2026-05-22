---
cycle: 0154
task_id: V18_warp_ttd_receipt_smoke
status: Complete
sponsors:
  human: James
  agent: Codex
completed_at: 2026-05-21
---

# Retro: V18 WARP TTD Receipt Smoke

## Hill

A live git-warp patch receipt can be projected through the generated
receipt-family descriptor into `warp-ttd`-targeted receipt facts with explicit
participant-runtime evidence posture.

## Result

Hill met.

## Witness

```text
npx vitest run test/unit/domain/continuum/WarpTtdReceiptFamilySmoke.test.ts test/unit/domain/continuum/ContinuumReceiptProjection.test.ts test/unit/domain/continuum/ContinuumEvidenceStatus.test.ts test/unit/infrastructure/adapters/ContinuumArtifactJsonFileAdapter.test.ts
Test Files  4 passed (4)
Tests       24 passed (24)

npm run typecheck:test -- --pretty false
npx eslint --no-warn-ignored test/unit/domain/continuum/WarpTtdReceiptFamilySmoke.test.ts
```

## Drift Check

No drift. The `warp-ttd` repo was inspected for consumer posture but not edited.
This slice stayed inside `git-warp`.

## What Mess We Got Into

The existing stack had enough local receipt truth, but `warp-ttd` could only
consume it by knowing the raw git-warp receipt shape.

## What Mess We Got Out Of

There is now an executable smoke proving a live git-warp receipt can be exposed
as generated receipt-family facts with participant-runtime evidence posture.

## What Comes Next

Re-plan with evidence in hand before expanding into reading envelopes, suffix
runtime boundaries, neighborhood core, and settlement-family cuts.
