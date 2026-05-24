---
cycle: 0222
task_id: V18_wet_run_drift_checks
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 74
---

# V18 Wet-Run Drift Checks

## Hill

Add explicit source-ref drift evidence to the wet-run harness before any future
finalization path can promote scratch history.

## Design

The harness now rechecks every restored v17 writer ref against the fixture
manifest after scratch migration and production-runtime replay. The result is
stored as a runtime-backed harness value and included in the deterministic
operator report.

This check is intentionally independent of finalization safety. Finalization is
still disabled in the wet-run harness, but the evidence shape is now ready for
the guarded finalization slices.

## Acceptance Criteria

- Successful wet runs record a passed drift check and checked ref count.
- Drifted writer heads produce fatal drift notices.
- Wet-run reports include drift status and checked ref count.
- Drift checks do not mutate restored source refs.

## Test Plan

Unit tests assert passed drift evidence for the canonical wet run, assert report
drift lines, and mutate a restored source ref to prove the drift checker returns
a fatal drift result.
