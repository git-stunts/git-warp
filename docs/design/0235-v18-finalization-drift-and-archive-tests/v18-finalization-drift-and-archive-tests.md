---
cycle: 0235
task_id: V18_finalization_drift_and_archive_tests
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 87
---

# V18 Finalization Drift And Archive Tests

## Hill

Prove the guarded CLI finalization path fails closed when live refs drift or
archive refs already exist.

## Design

The CLI test suite now covers two finalization failure modes at the command
wrapper boundary:

- reviewed live-ref evidence becomes stale before finalization;
- the requested archive ref already exists.

Both tests use a restored canonical v17 fixture and a matching finalization
request except for the deliberately introduced Git ref condition. The command
still runs planning, scratch writing, equivalence, and runtime replay, but the
finalization result is blocked. The CLI exit code is now tied to finalization
success when finalization is requested, so blocked finalization returns `1`
even when equivalence passed.

## Acceptance Criteria

- Stale live refs return a blocked finalization report.
- Existing archive refs return a blocked finalization report.
- The archive ref is not created on live-ref drift.
- The live ref is not moved on existing-archive failure.
- CLI exit code is non-zero when requested finalization is blocked.

## Test Plan

Run the graph-model migration command CLI unit test. It exercises the happy
path, live-ref drift, and pre-existing archive scenarios against restored v17
fixture repositories.
