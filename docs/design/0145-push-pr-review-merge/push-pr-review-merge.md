---
cycle: 0145
task_id: REL_push-pr-review-merge
status: Draft
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-05
release_home: v17.0.0
---

# Push PR Review Merge

## Pull

`REL_push-pr-review-merge` opened after
`0144-release-preflight-and-rc`. It is the final v17 release-blocker DAG node.
The job is coordination, not product work: push the release branch, open or
update the PR to `main`, inspect CI and review state, and stop before merge
unless James explicitly says `YES`.

## Hill

The release branch is visible on GitHub, represented by a PR against `main`,
and blocked only by external review, CI, or the explicit merge approval gate.

## Playback Questions

1. Is `release/v17.0.0` pushed to `origin` at the current local commit?
2. Does a PR exist from `release/v17.0.0` to `main`?
3. Are GitHub checks green, pending, or failed?
4. Are there review blockers?
5. Has James explicitly approved merge with `YES`?

## User Stories

- As a release operator, I can see the full v17 branch in GitHub instead of a
  local-only stack.
- As a reviewer, I can inspect one PR with the release notes, DAG evidence, and
  validation history.
- As a maintainer, I cannot accidentally merge the release without the explicit
  human approval required by the runbook.

## Requirements

- Do not rewrite history, rebase, force push, or amend.
- Push the current `release/v17.0.0` branch normally.
- Open a draft PR to `main` if none exists.
- Check PR CI and review state after the PR exists.
- Do not merge unless James replies exactly `YES`.
- Keep the DAG open until merge eligibility is proven and the approval gate is
  satisfied.

## Acceptance Criteria

- `git status --short --branch` no longer reports the branch ahead of
  `origin/release/v17.0.0`.
- GitHub has a PR from `release/v17.0.0` to `main`.
- PR checks are inspected and any failures are either fixed or surfaced.
- Review state is inspected and any requested changes are addressed or
  surfaced.
- Merge is not attempted without explicit approval.

## Test Plan

### RED

Current evidence before implementation:

- `git status --short --branch` reports
  `release/v17.0.0...origin/release/v17.0.0 [ahead 7]`.
- `gh pr list --head release/v17.0.0 --state all ...` returns `[]`.
- The first `git push -u origin release/v17.0.0` attempt is blocked by the
  pre-push link gate. `lychee --config .lychee.toml '**/*.md'` reports stale
  local links in six historical docs.

### GREEN

- Repair the stale links and prove `npm run lint:links` exits `0`.
- `git push -u origin release/v17.0.0` succeeds.
- `gh pr create --draft --base main --head release/v17.0.0 ...` creates the
  release PR, or an existing PR is updated instead.
- `gh pr checks` reports the current CI state.
- `gh pr view` reports the current review state.

### Goldens

- Local and remote branch tips match.
- The PR body records the v17 scope, validation evidence, and the explicit
  non-merge gate.
- The final release decision remains outside automation until James says
  `YES`.

### Known Fails

- Merge completion is expected to remain blocked until GitHub CI and review
  state are known.
- Even if CI and reviews are green, merge remains blocked until explicit human
  approval.

### Stress / Jitter

- CI may be pending immediately after push or after a follow-up metadata push.
- Draft PR creation may need a `gh` CLI fallback if the GitHub connector cannot
  infer the branch.
- A second push may retrigger checks if this cycle records PR metadata after
  opening the PR.
