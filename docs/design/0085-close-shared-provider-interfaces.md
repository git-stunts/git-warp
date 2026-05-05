---
title: "Close shared provider interfaces"
cycle: "0085-close-shared-provider-interfaces"
---

# Close Shared Provider Interfaces

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

`CROSS_shared-provider-interfaces` is already marked shipped in the v17 release
ledger. Leaving the card live creates false blockers on controller,
materializer, and host-bag cleanup work.

## Hill

The stale `CROSS_shared-provider-interfaces` backlog card is removed, and no
live v17 note is blocked by it.

## Playback questions

### Agent

- Is the stale shared-provider card deleted?
- Are downstream `blocked_by` lists free of `CROSS_shared-provider-interfaces`?
- Does the v17 ledger still preserve the shipped milestone?

### Human

- If I inspect v17 dependencies, does shared-provider foundation read as done
  rather than open work?

## Test plan

### Witness

- `npx vitest run test/unit/scripts/incremental-index-updater-closeout-shape.test.ts test/unit/scripts/remaining-big-files-closeout-shape.test.ts`
- `git diff --check`

## Playback

### Verdict

`hill met`
