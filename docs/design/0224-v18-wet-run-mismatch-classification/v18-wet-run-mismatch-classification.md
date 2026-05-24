---
cycle: 0224
task_id: V18_wet_run_mismatch_classification
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 76
---

# V18 Wet-Run Mismatch Classification

## Hill

Turn the canonical wet-run equivalence gap from a count into actionable,
operator-readable mismatch evidence.

## Design

The wet-run report now emits structured mismatch lines when the genesis
equivalence gate is blocked. Each line records mismatch kind, fact kind,
fact key, field path, legacy value, and migrated value. Non-printable
separators are escaped so property source keys remain legible in terminal and
PR output.

The current five mismatch classes are:

- content attachment value differs between fixture evidence and runtime blob
  OID;
- edge visibility is missing because the fixture maps the edge but not the
  target endpoint node;
- removed-node visibility is missing from migrated readings;
- property value differs between descriptive fixture text and migration source
  evidence;
- multi-writer coverage is missing from migrated readings.

## Acceptance Criteria

- Wet-run reports include mismatch details when equivalence is blocked.
- Property source keys escape null separators as `\0`.
- The report still remains deterministic across temporary restore locations.
- Tests assert all five canonical mismatch classes.

## Test Plan

Unit tests run two wet runs in different temporary directories, assert identical
report text, and assert the five classified mismatch classes in the report.
