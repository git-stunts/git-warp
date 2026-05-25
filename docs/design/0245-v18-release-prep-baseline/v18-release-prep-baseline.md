---
cycle: 0245
task_id: V18_release_prep_baseline
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-25
completed_at: 2026-05-25
release_home: v18.0.0
bearing_task: 97
---

# V18 Release-Prep Baseline

## Hill

Reset the public-release branch from the merged v18 release-candidate evidence
and make the next release-prep work explicit.

## Context

PR #106 merged the v18 release-candidate evidence packet through slice 96. The
next work is not another feature tranche. It is release hygiene: prove the
gate set, decide residual raw content/property risk, freeze operator release
notes, align package metadata, and replan from evidence before tagging.

## Design

This slice updates `docs/BEARING.md` so it names the current branch and merged
PR accurately. It also adds a short release-prep checklist for slices 97
through 102.

The checklist deliberately keeps residual raw content/property storage as a
decision point. The executable closeout audit still names many compatibility
boundaries, so this branch must either retire more storage with evidence or
ship the remaining boundary as an explicit release risk.

## Acceptance Criteria

- `BEARING` no longer says the current branch is the merged slice-66-through-75
  feature branch.
- `BEARING` names PR #106 as the latest merged PR.
- Slices 97 through 102 have named release-prep scope.
- The release-prep direction does not widen v18 into v19 or v20 claims.

## Test Plan

- Run Markdown lint for edited docs.
- Run `git diff --check`.
- Inspect the diff before committing.
