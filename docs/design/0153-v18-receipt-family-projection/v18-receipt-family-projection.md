---
cycle: 0153
task_id: V18_receipt_family_projection
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-21
completed_at: 2026-05-21
release_home: v18.0.0
---

# V18 Receipt Family Projection

## Pull

The repo can admit generated receipt-family artifacts and can now distinguish
translated substrate evidence from native Continuum evidence. The next step is
to project real `git-warp` receipt facts into the generated Continuum
receipt-family shape.

## Hill

`TickReceipt` values can be projected into Continuum receipt-family `Receipt`
facts with generated artifact authority and explicit translated git-warp
evidence posture.

## Playback Questions

Agent:

- Does the projector map `TickReceipt` fields to the receipt-family `Receipt`
  shape?
- Does the projection carry generated artifact authority and explicit evidence
  status?
- Does the projection reject non-receipt-family artifacts?

Human:

- Can `warp-ttd` receive receipt-family facts from `git-warp` instead of
  reverse-engineering local `TickReceipt` folklore?

## Accessibility / Assistive Reading Posture

The projection is inspectable structured data. No visual-only state is
introduced.

## Localization / Directionality Posture

Protocol identifiers are not localized. Summaries are plain strings that can be
localized later at product boundaries.

## Agent Inspectability / Explainability Posture

The projection keeps artifact descriptor, evidence status, and receipt facts as
separate inspectable fields.

## Non-Goals

- Do not claim native Continuum witnesshood.
- Do not add delivery observation projection yet.
- Do not call Wesley or parse GraphQL at runtime.

## RED

Expected failing spec:

```text
npx vitest run test/unit/domain/continuum/ContinuumReceiptProjection.test.ts
```

Observed RED:

```text
Error: Cannot find module '../../../../src/domain/continuum/ContinuumReceipt.ts'
```

## GREEN

This slice adds:

- `ContinuumReceipt`
- `ContinuumReceiptFamilyProjection`
- `ContinuumReceiptProjector`

`TickReceipt` maps into the Continuum receipt-family `Receipt` shape:

- `patchSha` becomes `receiptId`, `headId`, and `digest`;
- `lamport` becomes `frameIndex` and `outputTick`;
- `writer` becomes `laneId` and `writerId`;
- superseded operations become rejected rewrites;
- applied and redundant operations become admitted rewrites;
- evidence posture remains separate from the receipt fact.

The aggregate projection requires a `receipt-family` artifact descriptor and
keeps artifact authority, evidence status, and receipt facts as separate
inspectable fields.

## Playback

Witness:

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

Agent answers:

- Yes, the projector maps `TickReceipt` fields to Continuum `Receipt` fields.
- Yes, the projection carries generated artifact authority and explicit
  evidence status.
- Yes, non-receipt-family artifacts are rejected.

Human answer:

- `warp-ttd` can now receive receipt-family facts from `git-warp` without
  reverse-engineering raw `TickReceipt` shape.

## SSJS Scorecard

- Runtime-backed forms: green; receipt and projection are classes with
  constructor validation and frozen instances.
- Boundary validation: green; generated artifact authority stays represented
  by the descriptor admitted in the previous slice.
- Behavior ownership: green; receipt projection behavior lives in the projector.
- Message parsing: green; no behavior branches parse messages.
- Ambient time or entropy: green; no ambient time or entropy introduced.
- Fake shape trust or cast-cosplay: green; evidence status remains separate and
  translated by default.

## Closeout

This closes BEARING task 9 and gives the next slice a generated-family receipt
fact set to smoke through the `warp-ttd` consumer posture.
