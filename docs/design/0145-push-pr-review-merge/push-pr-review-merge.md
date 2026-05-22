---
cycle: 0145
task_id: REL_push-pr-review-merge
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-05
completed_at: 2026-05-21
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

## Closeout

The coordination hill is closed in repo-visible history:

- PR #84 merged the `release/v17.0.0` branch to `main`.
- PR #85 landed v17 follow-up repair and package migration work.
- PR #86 landed release publish hardening.
- PR #87 finalized the v17 coverage ratchet and produced the signed
  `v17.0.0` tag.
- PR #88 recovered npm release publishing.
- PR #89 landed the post-release README wording cleanup.

The release branches have been pruned from `origin`, `origin/main` is at
`5afdd3eb`, and `v17.0.0` is visible on npm and JSR.

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
- PR #84 CI at `cf1c9e3c` reports additional release-push drift:
  GitHub lychee rejects absolute local filesystem links, Bun API integration
  tests still assert private materialization internals and stale
  `materializeAt()` behavior, checkpoint content anchors label CAS trees as
  blobs, and Deno type resolution fails on an untyped npm dependency before
  the runtime smoke tests can run.
- PR #84 CI at `a799763b` proves the first repair slice cleared links, Bun,
  and Deno, then exposed a CI-only `rg` dependency: `type-firewall`,
  `coverage-threshold`, `test-node (22)`, and `preflight` fail because hosted
  runners cannot spawn `rg`.
- PR #84 CI at `3e4e8170` proves the `rg` dependency fix: `type-firewall` and
  `coverage-threshold` pass, while `test-node (22)` exposes one remaining stale
  integration expectation where checkpoint creation runs without an explicit
  reading basis and correctly raises `E_NO_STATE`.
- Full local Node 22 Docker validation after that integration repair gets the
  Vitest half green, then exposes stale BATS TypeScript-migration residue:
  BATS still calls deleted `seed-*.js` helpers, one CLI smoke fixture imports
  deleted source `.js` modules directly, and `--view` smoke tests still expect
  the removed in-process renderer instead of the v17 `warp-ttd` migration
  guidance.
- Full BATS after the TypeScript helper repair exposes four remaining stale
  CLI-contract assertions: `history` no longer errors without `--writer`
  because the global writer default is `cli`, and default `seek` /
  `verify-audit` output is JSON rather than the old hand-rendered ASCII text.

### GREEN

- Repair the stale links and prove `npm run lint:links` exits `0`.
- `git push -u origin release/v17.0.0` succeeds.
- `gh pr create --draft --base main --head release/v17.0.0 ...` creates the
  release PR, or an existing PR is updated instead.
- `gh pr checks` reports the current CI state.
- `gh pr view` reports the current review state.
- Follow-up CI repair keeps v17 public behavior honest: Bun integration tests
  assert public query/checkpoint/content behavior, checkpoint content anchors
  use CAS tree entries, Deno runtime smoke tests run with `--no-check`, and
  the Deno smoke harness records the external dependency timer sanitizer
  limitation as bad-code backlog.
- Follow-up CI portability repair removes hard `rg` dependencies from the
  repo-native checks hit by hosted runners: the anti-sludge shell check no
  longer requires a tool it does not use, and the tracked non-TS tail witness
  uses `git ls-files` as the source of truth.
- Follow-up Node integration repair aligns the checkpoint workflow with the
  v17 read contract by opening an explicit runtime reading basis before
  checkpoint creation.
- Follow-up BATS repair maps legacy seed helper names to checked-in
  TypeScript helpers, runs helper scripts with Node's TypeScript transform,
  and updates the Node 22 CLI shim to execute `bin/warp-graph.ts` instead of a
  deleted source `.js` file. Stale `--view` BATS cases now assert the v17
  removal error and `warp-ttd` guidance instead of expecting rendered output.
- Follow-up Node 22 CLI repair restores the documented `query`, `path`, and
  `history` commands, opens an explicit internal reading basis for CLI
  query/path reads, wires trust evaluation to the git-backed trust chain,
  fixes CAS trust tip record-id lookup for current git-cas manifest trees,
  and makes hook installation locate the package root from either source or
  built `dist/` paths.
- Follow-up BATS contract repair aligns default-output tests with the current
  structured JSON emitter and the global `--writer cli` default.
- `PATH="$PWD/bin:$PATH" bats test/bats/` passes `110` tests.
- `npm run test:node22:ci` passes: Vitest `455` files / `6867` tests and
  BATS `110` tests.
- `npm run test:node22` passes in Docker Node 22: Vitest `455` files /
  `6867` tests and BATS `110` tests.

### Goldens

- `main` contains the release merge and follow-up release hardening.
- The signed `v17.0.0` tag points at the final coverage-ratchet release merge.
- npm and JSR both expose `17.0.0` as the latest package version.
- The final release branches are no longer open remote work.

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
- GitHub Actions may use stricter or newer tool versions than the local
  pre-push gate; the link checker caught absolute local markdown paths that the
  earlier local version did not.
- GitHub-hosted Ubuntu images may lack local developer tools such as
  ripgrep, so release gates must either install them explicitly or avoid
  depending on them for tracked-file enumeration.
