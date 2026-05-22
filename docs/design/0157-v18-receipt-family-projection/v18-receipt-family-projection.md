---
cycle: 0157
task_id: V18_receipt_family_projection
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
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

- Projection without a generated receipt-family descriptor fails.
- Projection without evidence posture fails.
- Projection against the wrong family descriptor fails.
- A receipt missing required local source facts fails.

## Verification

- Focused receipt-family projection tests.
- Generated fixture conformance checks.
- `npm run lint`
- `npm run typecheck`
- Targeted receipt tests.

## SSJS Scorecard

- Runtime-backed forms: planned; projection output is a named class.
- Boundary validation: green; generated descriptor ingestion remains adapter
  owned.
- Behavior ownership: planned; projection owns only mapping, not receipt
  semantics.
- Message parsing: green.
- Ambient time or entropy: green.
- Fake shape trust or cast-cosplay: planned; descriptor and posture are
  explicit inputs.

