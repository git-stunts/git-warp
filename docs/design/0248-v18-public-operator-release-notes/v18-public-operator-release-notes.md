---
cycle: 0248
task_id: V18_public_operator_release_notes
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-25
completed_at: 2026-05-25
release_home: v18.0.0
bearing_task: 100
---

# V18 Public Operator Release Notes

## Hill

Freeze public operator notes for `v18.0.0` so the release says exactly what is
proved and exactly what is not.

## Design

The release notes live at `docs/releases/v18.0.0/README.md`. They translate the
release-candidate evidence into operator-facing instructions:

- what v18 adds;
- how to run dry-run, scratch, equivalence, and guarded finalization paths;
- how archive refs preserve rollback evidence;
- which risks are accepted;
- which claims are explicitly out of scope.

## Acceptance Criteria

- Public notes describe dry-run, scratch writing, equivalence gating,
  production-runtime replay, guarded finalization, archive refs, and rollback
  posture.
- Public notes state that remaining raw content/property compatibility storage
  is accepted residual risk.
- Public notes state that end-to-end graph streaming reads and writes are a
  v20 goal, not a v18 claim.
- Public notes keep Continuum language sibling-participant accurate.

## Test Plan

- Run Markdown lint for the release notes and this design doc.
- Run `git diff --check`.
