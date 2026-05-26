# Backlog Lane Cleanup After V18

## Hill

Cleanly separate shipped v18 work, deferred storage debt, v19 doctrine work,
v20 streaming/runtime work, and v21 distributed/plural admission work.

## Context

The backlog already has release lanes for v18 through v21. After the v18
release-prep merge, the remaining risk is not lack of backlog files. The risk
is stale status: a reader may not know which items are shipped, deferred,
promoted, blocked, or intentionally later-major.

The cleanup should be surgical. Do not reorganize the whole backlog mid-cycle.
Make the few labels and lane summaries that prevent planning mistakes.

## User Stories

- As a planner, I can inspect backlog lanes and know which release owns the
  next work.
- As a reviewer, I can see that v18 residual risk has not vanished.
- As a maintainer, I can avoid dragging v20 streaming or v21 braid semantics
  into v19 by accident.

## Acceptance Criteria

- `v18.0.0` backlog marks implementation blockers complete and public release
  tag/publish as the remaining release action.
- `v19.0.0` backlog is framed as observer/admission doctrine convergence.
- `v20.0.0` backlog keeps graph streaming and slice-first runtime realization.
- `v21.0.0` backlog keeps plural/distributed admission semantics.
- No stale doc suggests v18 is blocked on v19, v20, or v21 work.

## Test Plan

- Inspect release lane READMEs for contradictory status.
- `rg -n "blocked|tag|publish|streaming|witnesshood" docs/method/backlog`.
- Markdown lint edited lane files.
