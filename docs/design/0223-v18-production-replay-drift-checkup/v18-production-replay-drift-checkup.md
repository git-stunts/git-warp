---
cycle: 0223
task_id: V18_production_replay_drift_checkup
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 75
---

# V18 Production Replay Drift Checkup

## Hill

Re-plan from evidence after adding production-runtime scratch replay,
public-read builders, the v17 fixture wet-run harness, deterministic reports,
failure fixtures, and drift checks.

## Evidence

The runtime path is materially stronger than it was at slice 65:

- scratch migration commits can be replayed through the normal runtime patch
  and materialization path;
- restored v17 fixture refs are verified immediately before legacy reading
  construction;
- scratch public-read facts are projected from materialized runtime snapshots;
- the v17 fixture wet-run restores real Git refs, writes scratch history,
  captures a deterministic operator report, and checks source-ref drift.

The wet-run is not ready for finalization work. The current canonical fixture
report records six legacy facts, three migrated facts, and five public-read
mismatches. That is useful progress because the gap is now executable and
stable, but it means the next goalpost must be equivalence closure before CLI
finalization.

## Decision

Pause the finalization runway. The next slices should drive the canonical
wet-run public-read mismatch count to zero, then re-open finalization design
with better evidence.

## Test Plan

The checkup is documentation-only. It relies on the green slice 66-74 tests and
the branch drift check before PR review.
