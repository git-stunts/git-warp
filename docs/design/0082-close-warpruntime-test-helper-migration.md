---
title: "Close WarpRuntime test/helper migration"
cycle: "0082-close-warpruntime-test-helper-migration"
---

# Close WarpRuntime Test/Helper Migration

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

Cycles `0080` and `0081` migrated the actual helper and runtime-facing suite
surfaces off `WarpRuntime`.

The remaining backlog card is now a closeout gate, not implementation work. It
must prove the ratchets still pass, delete the completed card, and unblock the
class-delete task so the next cycle can remove source/export residue instead of
rediscovering test migration work.

## Hill

The `DX_migrate-tests-and-seed-helpers-off-warpruntime` backlog card is closed
after the helper and suite ratchets prove test/helper surfaces no longer depend
on `WarpRuntime`.

## Playback questions

### Agent

- Do the helper and seed ratchets pass?
- Does the runtime-facing suite ratchet pass?
- Does the runtime-kill split-chain ratchet now describe the closed state?
- Is `API_delete-warpruntime-class` unblocked?

### Human

- If I inspect the v17 runtime-kill queue, is the next actionable item now the
  class delete rather than another migration closeout?

## Accessibility / assistive reading posture

Not user-facing. No additional accessibility posture is required.

## Localization / directionality posture

Not user-facing. No localization or directionality impact.

## Agent inspectability / explainability posture

The closeout is enforced by executable script tests:

- helper/seed ratchet
- runtime-facing suite ratchet
- backlog/release-chain ratchets

The closed backlog state must be inspectable from ordinary files and not depend
on chat history.

## Non-goals

- No `WarpRuntime.ts` source deletion in this slice
- No public API removal in this slice
- No new helper or suite migration beyond proving the existing ratchets

## Test plan

### RED

Update the split-chain ratchets so they fail while:

- `DX_migrate-tests-and-seed-helpers-off-warpruntime.md` still exists
- `API_delete-warpruntime-class.md` is still blocked by the closeout card
- the release ledger still names the closeout card as the live next step

### GREEN

- run helper and suite ratchets
- remove the completed closeout card
- unblock `API_delete-warpruntime-class`
- update the runtime-kill ledger and backlog/workload counts

### Witness

- `npm exec vitest run test/unit/scripts/warpruntime-helper-migration.test.ts test/unit/scripts/warpruntime-suite-migration.test.ts test/unit/scripts/migrate-warpruntime-test-helper-split.test.ts test/unit/scripts/delete-warpruntime-class-split.test.ts test/unit/scripts/kill-warpruntime-split.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. The helper and seed ratchets pass.
- Yes. The runtime-facing suite ratchet passes.
- Yes. The runtime-kill split-chain ratchets now describe the closed state.
- Yes. `API_delete-warpruntime-class` is unblocked.

### Human

- Yes. The next actionable v17 runtime-kill item is now
  `API_delete-warpruntime-class`.

### Verdict

`hill met`

## Drift check

No negative drift. The remaining work is now correctly smaller: delete the
runtime class/export residue, then close the umbrella.
