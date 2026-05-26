# V18 Tag And Publish Gate

## Hill

Define the final public-release gate for `v18.0.0` without performing it on a
feature branch.

## Context

`package.json`, `jsr.json`, workspace package manifests, lockfile metadata,
and the changelog now agree on `18.0.0`. The release-prep branch passed local
preflight before merge, and GitHub CI passed before PR #107 merged.

That is necessary but not sufficient. The public release must still be cut
from merged `main`, and publish evidence must agree with the tag target.

## User Stories

- As a release manager, I can run a short gate before tagging and know which
  evidence must be attached to the release record.
- As a package consumer, I can trust that the npm artifact, JSR artifact, and
  Git tag describe the same source tree.
- As a maintainer, I do not have to infer whether a feature branch is allowed
  to publish.

## Acceptance Criteria

- The release gate requires `main` to match `origin/main`.
- The gate requires `npm run release:preflight` on `main` before tagging.
- The gate requires the tag target, npm dry-run, JSR dry-run, and published
  artifacts to agree on `18.0.0`.
- The gate does not create a tag from a feature branch.
- The gate preserves the v18 non-claim around full graph streaming reads and
  writes.

## Test Plan

- `git checkout main`
- `git pull --ff-only origin main`
- `npm run release:preflight`
- `git tag --list v18.0.0`
- `npm view @git-stunts/git-warp version`
- JSR package version inspection after publish
