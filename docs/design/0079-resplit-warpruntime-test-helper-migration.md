---
title: "Resplit WarpRuntime test/helper migration"
cycle: "0079-resplit-warpruntime-test-helper-migration"
---

# Resplit WarpRuntime Test/Helper Migration

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

After `0078`, the last blocker under
[API_delete-warpruntime-class.md](/Users/james/git/git-stunts/git-warp/docs/method/backlog/v17.0.0/API_delete-warpruntime-class.md)
is
[DX_migrate-tests-and-seed-helpers-off-warpruntime.md](/Users/james/git/git-stunts/git-warp/docs/method/backlog/v17.0.0/DX_migrate-tests-and-seed-helpers-off-warpruntime.md).

Repo truth says that note is still too broad to execute honestly as one patch:

- test helpers and seed surfaces still dynamic-import or open `WarpRuntime`
- unit/integration/runtime suites still import `WarpRuntime` directly or assert
  `instanceof WarpRuntime`
- the residue spans more than seventy real import/open sites across helper and
  suite surfaces

That means the blocker itself still needs an executable split before the class
delete can proceed honestly.

## Hill

Rewrite the `WarpRuntime` test/helper migration blocker as an explicit
helper/seed migration followed by a runtime-suite migration so the remaining
delete path becomes executable instead of one giant test-surface bomb.

## Playback questions

### Agent

- Does `DX_migrate-tests-and-seed-helpers-off-warpruntime` now read as an
  umbrella over smaller real successor cuts?
- Do the new successor notes separate helper/seed migration from broad suite
  migration?
- Do the `v17` release ledger and workloads reflect the new order?

### Human

- If I inspect the remaining `WarpRuntime` delete path now, can I tell what to
  do first in tests and helpers instead of just being told “migrate everything”?

## Accessibility / assistive reading posture

Not user-facing. No additional accessibility posture is required beyond keeping
the split explicit in docs and ratchets.

## Localization / directionality posture

Not user-facing. No localization or directionality impact.

## Agent inspectability / explainability posture

The split must be repo-inspectable. A reader should be able to see which
surface is helper/seed infrastructure and which surface is the broad runtime
test suite, with the remaining delete chain spelled out in the release ledger.

## Non-goals

- No actual test/helper migration in this slice
- No `WarpRuntime.ts` file deletion in this slice
- No source-side bridge or host-product changes in this slice

## Test plan

### RED

Add a ratchet that fails until:

- the umbrella note is blocked by new helper/seed and suite successor cuts
- the successor notes exist and describe their target surfaces
- the `v17` release ledger records the new order

### GREEN

- add the two successor notes
- rewrite the umbrella note as the closeout gate over that chain
- update the `v17` release ledger, workload map, and backlog counts

### Witness

- `npm exec vitest run test/unit/scripts/migrate-warpruntime-test-helper-split.test.ts test/unit/scripts/delete-warpruntime-class-split.test.ts test/unit/scripts/kill-warpruntime-split.test.ts`
- `git diff --check`

## Playback

### Agent

- Yes. `DX_migrate-tests-and-seed-helpers-off-warpruntime` now reads as an
  umbrella over smaller real successor cuts.
- Yes. The new successor notes separate helper/seed migration from broad suite
  migration.
- Yes. The `v17` release ledger and workloads now reflect the new order.

### Human

- Yes. The remaining `WarpRuntime` delete path now says what to do first in
  tests and helpers instead of just telling me to migrate everything.

### Verdict

`hill met`

## Drift check

No negative drift.
