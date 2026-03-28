# Release Policy Reconciliation For v15

Status: DESIGN
Date: 2026-03-28

## Problem

The repository's release-facing artifacts drifted apart during the `v15` public API cycle.

At the start of this slice:

- `package.json` was already `15.0.0`
- `jsr.json` was still `14.16.2`
- the release runbook still required a README `What's New` section
- the release workflow still enforced that removed README release-feed model
- the roadmap header still described an older `v14.1.0` baseline

That meant the branch was not honest about how `v15` should actually be released.

## Decisions

### 1. Version metadata must match before PR close-out

The intended release line on the branch is `15.0.0`.

That means `package.json` and `jsr.json` should match before the PR loop closes, even though the tag and publish steps still happen later from `main`.

### 2. Release chronology lives in `CHANGELOG.md`, not in the README

The README is now first-use onboarding.

The release policy should not require a per-version README `What's New` section that the docs strategy explicitly removed.

### 3. The normal PR loop is part of the release process

The release runbook should describe the actual operational order:

1. prepare release content on a branch
2. run preflight
3. push the branch and open a PR to `main`
4. merge after review
5. tag from `main`
6. publish from the tag workflow

### 4. The roadmap header should distinguish shipped main from unreleased branch intent

The roadmap should not claim `v14.1.0` as the current repo truth when the branch is intentionally preparing `v15.0.0`.

It should distinguish:

- the current release on `main`
- the next intended unreleased release on the active branch

## Exit criteria

This slice is complete when:

1. `package.json` and `jsr.json` are aligned
2. the release runbook and preflight script no longer require README `What's New`
3. the GitHub release workflow no longer enforces the removed README section
4. the roadmap header reflects the current `main` release and unreleased `v15` branch intent
5. static policy tests lock those expectations in
