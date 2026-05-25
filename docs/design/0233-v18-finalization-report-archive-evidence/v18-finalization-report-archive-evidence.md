---
cycle: 0233
task_id: V18_finalization_report_archive_evidence
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 85
---

# V18 Finalization Report Archive Evidence

## Hill

Make command reports expose archive-preservation evidence for every attempted
finalization.

## Design

The command report now emits a finalization evidence block whenever a
finalization result exists. The block is present for completed, blocked, and
partial-archive outcomes. It includes:

- live ref;
- archive ref;
- previous live head;
- archive head;
- finalized live head;
- archive preservation status.

For completed and partial-archive outcomes, `archiveHead` is the previous live
head preserved under the archive ref. For blocked outcomes, no archive was
created and the report emits `(none)` with `archivePreserved: no`.

This does not enable CLI finalization. It only makes the lower-level command
report explicit enough for the future CLI to show what happened.

## Acceptance Criteria

- Completed finalization reports include `archiveHead` and
  `archivePreserved: yes`.
- Blocked finalization reports include live/archive targets and
  `archivePreserved: no`.
- Fatal errors remain present after the evidence block.
- Existing skipped-finalization reports remain unchanged.

## Test Plan

Unit tests cover completed finalization and blocked finalization command
reports. Typecheck validates the formatter change.
