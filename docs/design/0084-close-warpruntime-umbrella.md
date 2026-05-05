---
title: "Close WarpRuntime umbrella"
cycle: "0084-close-warpruntime-umbrella"
---

# Close WarpRuntime Umbrella

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

The runtime-kill chain has no remaining executable runtime cut. Cycles `0067`
through `0083` removed the bridge, helper, internal shim, host-product,
test/helper, suite, class, file, and opener residue.

The remaining `API_kill-warpruntime` card is now an umbrella closeout. Keeping
it open would make downstream release work look blocked by a completed chain.

## Hill

`API_kill-warpruntime` is removed from the live backlog and no live v17 note
depends on it as unfinished work.

## Playback questions

### Agent

- Is `API_kill-warpruntime.md` deleted?
- Is `TS_publish-pipeline` no longer blocked by `API_kill-warpruntime`?
- Are completed prerequisite notes no longer claiming to block the umbrella?
- Does the release ledger mark the runtime-kill chain closed?

### Human

- If I inspect the v17 queue, is the runtime kill done and launch-prep no
  longer waiting on it?

## Accessibility / assistive reading posture

Not user-facing. No additional accessibility posture is required.

## Localization / directionality posture

Not user-facing. No localization or directionality impact.

## Agent inspectability / explainability posture

The closeout is inspectable through ordinary files: the umbrella backlog card
is gone, downstream `blocked_by` lists no longer name it, and the v17 release
ledger records the closure.

## Non-goals

- No publish-pipeline implementation in this slice
- No package extraction work in this slice
- No historical audit/archive rewrite in this slice

## Test plan

### RED

Update the runtime-kill split ratchet so it fails while:

- `API_kill-warpruntime.md` still exists
- `TS_publish-pipeline` still names `API_kill-warpruntime`
- prerequisite closeout cards still claim to block the umbrella
- the v17 release ledger still shows the runtime kill as live

### GREEN

- delete the completed umbrella card
- remove `API_kill-warpruntime` from downstream and predecessor frontmatter
- update the v17 release ledger
- refresh backlog/workload counts

### Witness

- `npx vitest run test/unit/scripts/kill-warpruntime-split.test.ts test/unit/scripts/delete-warpruntime-class-split.test.ts test/unit/scripts/migrate-warpruntime-test-helper-split.test.ts test/unit/scripts/capability-consumer-migration-closeout.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. `API_kill-warpruntime.md` is deleted.
- Yes. `TS_publish-pipeline` no longer waits on `API_kill-warpruntime`.
- Yes. Completed predecessor notes no longer claim to block the umbrella.
- Yes. The release ledger marks the runtime-kill chain closed.

### Human

- Yes. The runtime kill is done and launch-prep is no longer waiting on it.

### Verdict

`hill met`

## Drift check

No negative drift. Runtime-kill completion is now represented as a closed
release milestone rather than an open backlog dependency.
