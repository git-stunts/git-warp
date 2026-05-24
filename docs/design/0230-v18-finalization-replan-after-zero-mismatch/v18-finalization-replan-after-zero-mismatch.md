---
cycle: 0230
task_id: V18_finalization_replan_after_zero_mismatch
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 82
---

# V18 Finalization Replan After Zero Mismatch

## Hill

Move the v18 roadmap from wet-run equivalence closure to guarded live
finalization, using the zero-mismatch canonical wet-run as evidence.

## Evidence In Hand

- The v17 golden fixture restores into an isolated Git repository.
- The migration command writes five scratch operations for the canonical
  fixture.
- The production runtime replays all five scratch operations.
- Legacy and migrated public-read evidence both contain seven facts.
- The canonical equivalence proof reports zero public-read mismatches.
- The wet-run report is deterministic and includes drift-check evidence before
  any live ref can move.

## Replan

The next release blocker is not equivalence. It is safe operator control over
live-ref movement. The finalization path must remain locked until the CLI can
accept a confirmation artifact that names the observed live head, scratch ref,
scratch head, archive ref, equivalence proof, and runtime replay evidence.

The next local sequence is:

1. Design the live finalization confirmation and report contract.
2. Add JSON adapters for finalization requests and confirmations.
3. Add finalization report sections that make archive preservation explicit.
4. Enable CLI finalization only behind exact confirmation.
5. Add stale-head and existing-archive tests before generated contract work
   resumes.

## Acceptance Criteria

- BEARING no longer names wet-run equivalence as the current blocker.
- BEARING names guarded live finalization as the next goalpost.
- The replan keeps generated Continuum/WARP Optic contract work behind
  finalization readiness.
- The plan keeps live refs untouched until confirmation and report semantics
  exist.

## Test Plan

This is a documentation slice. Run Markdown lint against BEARING and this
design document.
