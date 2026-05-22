---
cycle: 0156
task_id: V18_same_writer_concurrent_race_witness
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
completed_at: 2026-05-22
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

Observed first:

```text
npx vitest run test/unit/domain/warp/Writer.sameWriterRace.test.ts --reporter=verbose
```

The deterministic race witness failed because the losing same-writer session
surfaced as generic `PERSIST_WRITE_FAILED` after the post-update visibility
check, not as a retryable writer-frontier race.

## Implementation

`commitPatch()` now advances the writer ref through the `compareAndSwapRef`
port. The existing pre-build CAS read still catches stale sessions before
object creation; the final writer-tip advance is now also atomic, closing the
window where two sessions could both observe the old frontier before a plain
`updateRef()`.

When the atomic update fails and a fresh `readRef()` shows that the frontier
moved, the failure is translated to `WRITER_CAS_CONFLICT`, preserving
`expectedSha` and `actualSha` for the `PatchSession` classifier. If the ref did
not move, the original persistence failure propagates.

The race witness gates the two commit-time ref reads so both sessions start
from the same observed frontier without relying on timing. It then asserts one
winner, one retryable writer-race loser, final writer ref equality with the
winner, and materialized visibility of only the winning node.

## Verification

- `npx vitest run test/unit/domain/warp/Writer.sameWriterRace.test.ts --reporter=verbose`
- `npx vitest run test/unit/domain/warp/Writer.sameWriterRace.test.ts test/unit/domain/services/PatchCommitter.visibility.test.ts test/unit/domain/WarpGraph.noCoordination.test.js test/unit/domain/WarpGraph.writerInvalidation.test.ts test/unit/domain/warp/Writer.test.ts test/unit/domain/services/PatchBuilder.cas.test.ts --reporter=verbose`
- `npm run typecheck`
- `npm run lint`
- `npx markdownlint docs/BEARING.md docs/design/0156-v18-same-writer-concurrent-race-witness/v18-same-writer-concurrent-race-witness.md`

## Closeout

Same-writer races now have a witnessed retry posture at the writer frontier.
The losing patch may still have object-store residue, but it does not become
canonical graph truth, does not run the success hook, and does not appear in
materialized state.

## SSJS Scorecard

- Runtime-backed forms: use existing writer/frontier concepts where possible.
- Boundary validation: green; Git ref conflict remains a persistence fact and
  is translated at the write-path boundary.
- Behavior ownership: green; write path owns race result.
- Message parsing: green.
- Ambient time or entropy: green; no timing-only test.
- Fake shape trust or cast-cosplay: green; final state is observed.
