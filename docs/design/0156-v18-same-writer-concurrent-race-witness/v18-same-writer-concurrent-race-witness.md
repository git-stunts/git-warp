---
cycle: 0156
task_id: V18_same_writer_concurrent_race_witness
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
release_home: v18.0.0
bearing_task: 8
---

# V18 Same-Writer Concurrent Race Witness

## Pull

Writer isolation is only credible if same-writer races are visible. Two writes
from the same observed writer tip must not both claim canonical success.

## Hill

Add a same-writer concurrent patch race witness with final-frontier and
visible-state assertions.

## Playback Questions

- If two same-writer writes start from the same observed tip, which one becomes
  canonical?
- Does the losing write surface as retry/conflict/failure instead of silent
  success?
- Does final visible state match the final writer frontier exactly?
- Does the witness catch hidden objects that never became graph truth?

## Design

Use the visibility contract from slice 7 as the foundation. The test should
drive two same-writer writes from the same starting frontier and force the
ref-advance race at the adapter seam.

Assertions:

1. Exactly one final writer tip wins.
2. The visible graph state reflects the winning tip.
3. The losing write reports a failure or retry posture.
4. No orphaned losing object is treated as canonical state.

## Non-Goals

- Do not implement multi-writer conflict semantics here.
- Do not add Continuum projection here.
- Do not depend on timing as the proof mechanism.

## RED

- Build the race witness so the current path can be evaluated.
- Fail if both writes claim success.
- Fail if final visible state includes non-canonical losing facts.

## Verification

- Targeted same-writer race test.
- `test/unit/domain/WarpGraph.noCoordination.test.js` if write semantics are
  touched.
- `npm run lint`
- `npm run typecheck`

## SSJS Scorecard

- Runtime-backed forms: use existing writer/frontier concepts where possible.
- Boundary validation: green; Git ref conflict remains a persistence fact.
- Behavior ownership: planned; write path owns race result.
- Message parsing: green.
- Ambient time or entropy: green; no timing-only test.
- Fake shape trust or cast-cosplay: green; final state is observed.

