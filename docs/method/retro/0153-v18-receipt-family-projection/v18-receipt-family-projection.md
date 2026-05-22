---
cycle: 0153
task_id: V18_receipt_family_projection
status: Complete
sponsors:
  human: James
  agent: Codex
completed_at: 2026-05-21
---

# Retro: V18 Receipt Family Projection

## Hill

`TickReceipt` values can be projected into Continuum receipt-family `Receipt`
facts with generated artifact authority and explicit translated git-warp
evidence posture.

## Result

Hill met.

## Witness

```text
npx vitest run test/unit/domain/continuum/ContinuumReceiptProjection.test.ts test/unit/domain/continuum/ContinuumEvidenceStatus.test.ts test/unit/domain/index.exports.test.ts
Test Files  3 passed (3)
Tests       58 passed (58)

npm run typecheck:src -- --pretty false
npm run typecheck:test -- --pretty false
npm run lint:sludge
npx eslint --no-warn-ignored src/domain/continuum/ContinuumReceipt.ts src/domain/continuum/ContinuumReceiptFamilyProjection.ts src/domain/continuum/ContinuumReceiptProjector.ts test/unit/domain/continuum/ContinuumReceiptProjection.test.ts test/unit/domain/index.exports.test.ts index.ts
git diff --check
```

## Drift Check

No drift. The slice projected `TickReceipt` to receipt-family `Receipt` facts
only. Delivery observations and native Continuum witness production remain
out of scope.

## What Mess We Got Into

`warp-ttd` previously had to know too much about raw git-warp `TickReceipt`
shape. That is adapter folklore, not a generated-family contract.

## What Mess We Got Out Of

`git-warp` now owns the translation from its local receipt fact into a
Continuum receipt-family `Receipt`, with evidence posture carried separately.

## What Comes Next

Add the first `warp-ttd` smoke over the generated-family receipt projection.
