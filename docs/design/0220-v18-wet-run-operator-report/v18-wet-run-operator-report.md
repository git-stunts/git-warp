---
cycle: 0220
task_id: V18_wet_run_operator_report
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 72
---

# V18 Wet-Run Operator Report

## Hill

Capture deterministic, path-stable operator evidence for the v17 fixture
wet-run harness.

## Design

The formatter wraps the wet-run harness result and emits fixture identity,
restored writer refs, the existing graph-model migration command report, and
production-runtime replay status. Temporary repository paths are intentionally
excluded so the same fixture wet run formats identically across isolated
directories.

## Acceptance Criteria

- Two runs in different temporary directories produce the same report text.
- The report includes fixture id, graph id, restored refs, command status,
  mismatch counts, runtime replay status, operation count, and witness.
- The report excludes volatile temporary paths.
- Invalid report inputs fail at the report boundary.

## Test Plan

Unit tests run the wet-run harness twice in separate temporary directories,
format both results, assert identical report text, assert key operator lines,
and assert that temporary paths are not present.
