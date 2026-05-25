# V18 Post-Merge Release Handoff

## Hill

Record the state after the release-prep PR merged and make the remaining
`v18.0.0` release work explicit: tag and publish from `main`, with no new
runtime promise added on a follow-up branch.

## Context

PR #107 merged the `18.0.0` metadata, release notes, release-prep evidence,
and technical teardown to `main`. The package line is release-ready in source,
but the public release is not complete until the tag and publish artifacts are
cut from merged `main`.

The follow-up branch exists to cleanly bookkeep that handoff and set the next
engineering goalpost. It must not blur three different states:

- `18.0.0` metadata merged to `main`;
- `v18.0.0` tag created from `main`;
- npm and JSR artifacts published from that release path.

## User Stories

- As a release manager, I can tell whether the source tree, the Git tag, and
  the package registries all agree on `18.0.0`.
- As a maintainer, I can see that the release-prep PR has merged without
  accidentally treating that as a completed public release.
- As a downstream operator, I can inspect release notes that describe actual
  `v18` guarantees without inheriting hidden branch-state assumptions.

## Acceptance Criteria

- `docs/BEARING.md` names PR #107 as merged and `origin/main` as the source
  of truth for the current branch.
- The v18 blocker ledger treats PR review, CI, and merge as complete.
- Tag and publish remain explicitly open until registry evidence exists.
- No follow-up doc claims that end-to-end graph streaming is part of v18.

## Test Plan

- `git status --short --branch`
- `git rev-parse --short origin/main`
- `gh pr view 107 --json state,mergedAt,mergeCommit`
- `npx markdownlint` on edited Markdown files
- `git diff --check`
