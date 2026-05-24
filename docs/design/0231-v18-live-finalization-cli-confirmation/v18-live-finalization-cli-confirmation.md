---
cycle: 0231
task_id: V18_live_finalization_cli_confirmation
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 83
---

# V18 Live Finalization CLI Confirmation

## Hill

Define the CLI contract that can safely unlock live-ref finalization after a
zero-mismatch wet run.

## Current State

The command CLI intentionally refuses finalization flags. The lower-level
command and finalizer already have safety gates for live refs, archive refs,
scratch output, equivalence, runtime conformance, confirmation, and stale live
heads. The missing piece is an operator-supplied JSON artifact that binds those
proofs together before the CLI may move a live `refs/warp/*` ref.

## Confirmation Artifact

The CLI should eventually accept `--finalization-request <path>`. That JSON
artifact must contain:

- `confirmationToken`: the exact finalization confirmation token.
- `liveRefName`: the live `refs/warp/*` ref to move.
- `expectedLiveHead`: the live ref head observed when the operator reviewed the
  report.
- `scratchRefName`: the scratch ref produced by the migration command.
- `scratchHead`: the scratch ref head produced by the migration command.
- `archiveRefName`: the archive ref that will preserve the previous live head.
- `equivalence`: a compact summary with `mismatchCount`, `legacyFactCount`, and
  `migratedFactCount`.
- `runtimeReplay`: a compact summary with `status`, `scratchRefName`,
  `scratchHead`, and replayed operation count.

The JSON adapter must reject unknown fields and malformed envelopes. The CLI
must still derive the observed live head from Git at execution time; JSON is an
operator-confirmed expectation, not authority.

## CLI Flow

1. Run the normal command path and write scratch history.
2. Build legacy and migrated readings.
3. Run equivalence and runtime replay.
4. If no finalization request is supplied, report `finalization: skipped`.
5. If a finalization request is supplied, compare it with observed command
   evidence.
6. Evaluate finalization safety.
7. Archive the previous live head.
8. Compare-and-swap the live ref to the scratch head.
9. Report archive and live-ref evidence.

## Report Contract

The finalization report must include:

- finalization status;
- live ref name;
- archive ref name;
- previous live head;
- finalized live head;
- confirmation status;
- equivalence summary;
- runtime replay summary;
- archive preservation evidence.

## Acceptance Criteria

- The design keeps finalization locked behind an explicit JSON artifact.
- The CLI contract distinguishes operator expectations from Git-observed live
  evidence.
- The report contract names archive preservation as first-class evidence.
- Unknown JSON fields and missing proof summaries are planned as hard failures.

## Test Plan

This is a design slice. Run Markdown lint against this document and BEARING.
Implementation slices must add adapter tests for malformed JSON, mismatch
between JSON and command evidence, stale live heads, missing confirmation,
failed equivalence, failed runtime replay, and existing archive refs.
