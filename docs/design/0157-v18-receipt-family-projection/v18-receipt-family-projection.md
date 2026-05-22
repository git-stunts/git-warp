---
cycle: 0157
task_id: V18_receipt_family_projection
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
completed_at: 2026-05-22
release_home: v18.0.0
bearing_task: 9
---

# V18 Receipt-Family Projection

## Pull

Slices 5 and 6 provide generated artifact authority and evidence posture.
Slices 7 and 8 establish that git-warp patch history is visible causal truth.
The next compatibility step is projecting git-warp receipt facts into the
generated Continuum receipt-family shape without pretending they are native
Continuum witnesses.

## Hill

Project git-warp receipt facts into a generated Continuum receipt-family value
with conformance tests and explicit translated evidence posture.

## Playback Questions

- Which local facts are the source of receipt-family projection?
- Does projection require a generated receipt-family descriptor?
- Does the result carry translated git-warp evidence posture?
- Does projection fail when required generated-family fields are absent?

## Design

Use existing local anchors:

- `TickReceipt`
- op outcomes
- `DeliveryObservation`
- `ReceiptShard`
- audit receipt anchors where applicable

The projection should consume the descriptor loaded through the generated
artifact seam and produce a runtime-backed receipt-family projection value.
The projection must reference evidence posture from slice 6.

## Non-Goals

- Do not add `warp-ttd` smoke here.
- Do not implement settlement-family or runtime-boundary-family projection.
- Do not claim native Continuum witnesshood.

## RED

Observed first:

```text
npx vitest run test/unit/domain/continuum/ContinuumReceiptFamilyProjection.test.ts --reporter=verbose
```

The projection suite failed because `ContinuumReceiptFamilyProjection` and
`GitWarpReceiptSourceFacts` did not exist yet.

## Implementation

Added two runtime-backed domain concepts:

- `GitWarpReceiptSourceFacts` validates the local git-warp facts available for
  projection: a concrete `TickReceipt`, optional `DeliveryObservation` records,
  and an optional `ReceiptShard`.
- `ContinuumReceiptFamilyProjection` consumes a `ContinuumEvidenceClaim` plus
  source facts and emits generated-family arrays named after the Wesley fixture
  operations: `receipts`, `witnesses`, and `deliveryObservations`.

The projection requires:

- generated descriptor authority;
- `receipt-family` descriptor identity;
- `witnessScope: receipt-family` when a witness scope is present;
- explicit `translated-git-warp-evidence` posture;
- at least one local receipt operation outcome.

The witness output deliberately names its kind `git-warp-tick-receipt` and
copies the explicit evidence posture. It does not claim native Continuum
witnesshood.

## Verification

- `npx vitest run test/unit/domain/continuum/ContinuumReceiptFamilyProjection.test.ts --reporter=verbose`
- `npx vitest run test/unit/domain/continuum/ContinuumReceiptFamilyProjection.test.ts test/unit/domain/continuum/ContinuumEvidencePosture.test.ts test/unit/domain/continuum/ContinuumArtifactIngestionPolicy.test.ts test/unit/domain/index.exports.test.ts --reporter=verbose`
- `npx vitest run test/unit/domain/continuum/ContinuumReceiptFamilyProjection.test.ts test/unit/domain/continuum/ContinuumEvidencePosture.test.ts test/unit/domain/continuum/ContinuumArtifactIngestionPolicy.test.ts test/unit/domain/index.exports.test.ts test/unit/domain/types/TickReceipt.test.ts test/unit/domain/types/DeliveryObservation.test.ts --reporter=verbose`
- `npm run typecheck`
- `npm run lint`
- `npx markdownlint docs/BEARING.md docs/design/0157-v18-receipt-family-projection/v18-receipt-family-projection.md`

## Closeout

git-warp now has a generated-family receipt projection noun that can feed the
next `warp-ttd` smoke without adapter-local receipt folklore. It remains honest:
the evidence posture is translated git-warp evidence, not native Continuum
evidence.

## SSJS Scorecard

- Runtime-backed forms: green; projection output and source facts are named
  classes.
- Boundary validation: green; generated descriptor ingestion remains adapter
  owned.
- Behavior ownership: green; projection owns only mapping, not receipt
  semantics.
- Message parsing: green.
- Ambient time or entropy: green.
- Fake shape trust or cast-cosplay: green; descriptor and posture are
  explicit inputs.
