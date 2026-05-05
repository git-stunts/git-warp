---
title: "Close query builder god card"
cycle: "0087-close-query-builder-god-card"
---

# Close Query Builder God Card

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

The v17 release ledger already marks `GOD_query-builder` complete. Keeping the
card in the live backlog inflates the remaining runtime/API split work and
keeps a completed god-kill visible as if it still needs execution.

## Hill

The stale `GOD_query-builder` backlog card is removed from the live v17 queue.

## Playback questions

### Agent

- Is `GOD_query-builder.md` deleted?
- Is the v17 workload inventory free of `GOD_query-builder`?
- Does the v17 ledger still preserve the shipped milestone?

### Human

- If I inspect v17, does QueryBuilder read as a closed god-kill rather than
  open work?

## Test plan

### Witness

- `npx vitest run test/unit/scripts/query-builder-closeout.test.ts`
- `git diff --check`

## Playback

### Verdict

`hill met`
