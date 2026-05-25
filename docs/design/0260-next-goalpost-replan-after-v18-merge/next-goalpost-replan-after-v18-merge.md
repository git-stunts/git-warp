# Next Goalpost Replan After V18 Merge

## Hill

Set the next engineering goalpost after the v18 release-prep merge: finish the
public release mechanics from `main`, then choose between storage retirement
and the first v19 witnesshood runway with evidence in hand.

## Context

The repo has crossed an important boundary. The source tree on `main` now
contains the v18 release metadata and public release notes. The next work
should not keep adding v18 features on a release branch.

There are three honest next moves:

1. cut and publish `v18.0.0` from `main`;
2. retire one more raw content/property compatibility boundary;
3. start v19 observer/admission witnesshood work.

Those moves have different risk profiles. Publishing is release operations.
Storage retirement is local substrate debt reduction. V19 starts a new
semantic runway. They should not be smuggled into one ambiguous branch.

## User Stories

- As a release manager, I can finish v18 without new scope.
- As a maintainer, I can choose the next implementation slice based on risk,
  not momentum.
- As a future agent, I can read BEARING and know whether the repo is in
  release mode, debt-retirement mode, or v19 feature mode.

## Acceptance Criteria

- BEARING marks slices 103 through 112 as a post-merge planning chunk.
- The next goalpost is explicit and does not widen v18.
- The branch leaves tag/publish work as an operation to run from `main`.
- The branch gives storage retirement and v19 kickoff separate decision
  surfaces.

## Test Plan

- Markdown lint all new design docs.
- `git diff --check`
- Review `docs/BEARING.md` for stale branch, PR, and release status.
- Verify backlog lane summaries still point to the correct major releases.
