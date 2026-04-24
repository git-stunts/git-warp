---
title: "Close out capability consumer migration"
cycle: "0065-capability-consumer-migration-closeout"
---

# Close Out Capability Consumer Migration

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

`API_migrate-consumers-to-capabilities` is still marked live even though the
actual consumer tail has been burned down through cycles `0059`-`0064`.

That leaves a planning lie:

- the release ledger still reads like consumer migration is the blocker
- `API_kill-warpruntime` still points at `API_migrate-consumers-to-capabilities`
  even though the remaining residue is now composition-root/runtime-wiring work

## Hill

Repo truth says the consumer migration task is done, and the remaining runtime
residue is re-centered under `API_kill-warpruntime`.

## Playback questions

### Agent

- Does the `API_migrate-consumers-to-capabilities` note now read as satisfied?
- Does `API_kill-warpruntime` stop naming consumer migration as its blocker?
- Does the `v17` release ledger now say the remaining work is the runtime
  composition-root cut rather than the consumer tail?

### Human

- If I read the backlog after this cycle, is it obvious that the next runtime
  target is killing `WarpRuntime`, not doing more facade migration?

## Non-goals

- No new runtime code in this slice
- No `WarpRuntime` deletion in this slice

## Test plan

### RED

Add a shape ratchet that fails until:

- `API_kill-warpruntime.md` no longer lists
  `API_migrate-consumers-to-capabilities` under `blocked_by`
- the release ledger marks `API_migrate-consumers-to-capabilities` done

### GREEN

- update the migration note to a closeout section
- clear the stale blocker on `API_kill-warpruntime`
- update the `v17` release ledger to the new runtime-residue truth

### Witness

- `npm exec vitest run test/unit/scripts/capability-consumer-migration-closeout.test.ts`
- `git diff --check`

## Playback

### Agent

- Yes. The migration note now reads as satisfied by the completed consumer
  tranches.
- Yes. `API_kill-warpruntime` no longer lists consumer migration as its
  blocker.
- Yes. The release ledger now says the remaining work is the runtime
  composition-root residue.

### Human

- Yes. The next runtime target is now clearly killing `WarpRuntime`, not doing
  more consumer migration.

### Verdict

`hill met`

## Drift check

No negative drift.
