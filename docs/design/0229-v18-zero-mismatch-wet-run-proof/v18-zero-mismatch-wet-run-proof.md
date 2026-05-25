---
cycle: 0229
task_id: V18_zero_mismatch_wet_run_proof
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 81
---

# V18 Zero-Mismatch Wet-Run Proof

## Hill

Make the canonical v17-to-v18 wet-run report an executable zero-mismatch proof.

## Design

The canonical fixture wet-run now has a dedicated regression test for the
promotion proof itself. The test restores the v17 fixture, runs the full scratch
migration path, formats the deterministic operator report, and asserts that:

- the proof summary mismatch count is `0`;
- the gate has no divergence report;
- the command report records `command.mismatches: 0`;
- the wet-run report does not emit a top-level mismatch section.

This separates the release blocker proof from incidental report formatting
checks. Future changes can still reorganize the report, but they cannot
reintroduce fixture divergence without breaking an explicit zero-mismatch test.

## Acceptance Criteria

- The canonical wet-run proves zero public-read mismatches.
- The report keeps `command.mismatches: 0` as operator evidence.
- The report omits the divergence-only `mismatches:` section when equivalence
  succeeds.
- The proof remains deterministic across temporary restore directories.

## Test Plan

Run the v17 fixture wet-run harness test. The new zero-mismatch case performs a
full fixture restore, scratch write, production-runtime replay, equivalence
proof, and report formatting pass.
