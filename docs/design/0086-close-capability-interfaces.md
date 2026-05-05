---
title: "Close capability interfaces"
cycle: "0086-close-capability-interfaces"
---

# Close Capability Interfaces

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

The v17 release ledger already records `API_capability-interfaces` as shipped:
the capability contracts exist and downstream work has been using them. Keeping
the card open leaves false blockers on factory, query-controller, and strand
work.

## Hill

The stale `API_capability-interfaces` backlog card is removed, and no live v17
note is blocked by it.

## Playback questions

### Agent

- Is the stale capability-interface card deleted?
- Are downstream `blocked_by` lists free of `API_capability-interfaces`?
- Does the v17 ledger still preserve the shipped milestone?

### Human

- If I inspect v17 dependencies, do capability interfaces read as shipped
  foundation rather than open work?

## Test plan

### Witness

- `npx vitest run test/unit/scripts/capability-interfaces-closeout.test.ts`
- `git diff --check`

## Playback

### Verdict

`hill met`
