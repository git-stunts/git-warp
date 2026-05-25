---
cycle: 0244
task_id: V18_backlog_reconciliation
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 96
---

# V18 Backlog Reconciliation

## Hill

Bring the backlog ledger back into alignment with the v18 release-candidate
evidence without widening the v18 promise.

## Design

This slice reconciles four planning surfaces:

- the backlog dashboard in `docs/method/backlog/README.md`;
- the active v18 lane in `docs/method/backlog/v18.0.0/`;
- the shipped-but-residual v17 lane;
- the v20 horizon, where end-to-end graph streaming reads and writes now have
  a named release home.

The key planning correction is that the v18 backlog files were behind the
implementation evidence recorded in `BEARING`. Production-runtime scratch
replay, wet-run fixture evidence, guarded CLI finalization, generated
Continuum contract evidence, and the release-candidate packet are now
recorded as completed evidence. The remaining v18 public-release gate is
release hygiene and residual-risk review, not another feature expansion.

End-to-end graph streaming reads and writes are explicitly slotted into
`v20.0.0`. `v18.0.0` may carry stream foundations, but it does not claim full
graph streaming.

## Acceptance Criteria

- Backlog dashboard counts match the current file inventory.
- The v17 lane is described as shipped/residual, not active release work.
- The v18 lane records slices 66 through 95 as release-candidate evidence.
- The v18 release-blocker note names the remaining release-prep gates instead
  of completed implementation blockers.
- A v20 backlog note exists for end-to-end graph streaming reads and writes.
- `BEARING` records this reconciliation as slice 96.

## Test Plan

- Run Markdown lint against the edited backlog, design, and bearing docs.
- Run `git diff --check`.
- Inspect `git diff` before committing to confirm the slice remains docs-only.
