---
title: "Split WarpRuntime deletion into executable cuts"
cycle: "0066-kill-warpruntime-split"
---

# Split WarpRuntime Deletion Into Executable Cuts

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

`API_kill-warpruntime` is now unblocked, but the codebase no longer supports
the fiction that it is one slice.

Repo truth after `0064` / `0065` is:

- `WarpGraph.ts` still opens and binds a live `WarpRuntime`
- runtime helper wrappers still type against `WarpRuntime`
- runtime wiring and `_wiredMethods.d.ts` are still their own deletion cut

Treating that as one task would just create another giant notional kill card.

## Hill

`API_kill-warpruntime` is rewritten as an umbrella blocked by three explicit
successor tasks that match the remaining runtime residue.

## Playback questions

### Agent

- Does `API_kill-warpruntime` stop pretending it is a one-shot slice?
- Are the three remaining cuts named explicitly as backlog items?
- Does the release ledger point to those three cuts instead of the old
  one-step story?

### Human

- If I look at the backlog after this cycle, do I know exactly what to pull
  next to keep killing runtime residue?

## Non-goals

- No runtime code changes in this slice
- No `WarpRuntime` deletion in this slice

## Test plan

### RED

Add a shape ratchet that fails until:

- `API_kill-warpruntime.md` is blocked by three explicit successor notes
- the release ledger names the same split

### GREEN

- create successor notes for:
  - `WarpGraph` composition-root bridge cleanup
  - runtime helper wrapper cleanup
  - runtime wiring / `_wiredMethods` deletion
- update the umbrella note and release ledger to the split

### Witness

- `npm exec vitest run test/unit/scripts/kill-warpruntime-split.test.ts`
- `git diff --check`

## Playback

### Agent

- Yes. `API_kill-warpruntime` no longer pretends to be one slice.
- Yes. The three remaining cuts are named as explicit backlog notes.
- Yes. The release ledger now points to the split instead of the one-shot kill
  story.

### Human

- Yes. The next runtime target is now obvious: pull
  `API_warpgraph-runtime-bridge` first, then the helper-wrapper and
  runtime-wiring cuts.

### Verdict

`hill met`

## Drift check

No negative drift.
