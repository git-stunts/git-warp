---
title: "Remove direct WarpRuntime typing from helper wrappers"
cycle: "0068-runtime-helper-wrapper-seams"
---

# Remove Direct WarpRuntime Typing From Helper Wrappers

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

After `0067`, the next explicit runtime-kill blocker was the helper-wrapper
surface:

- `DetachedGraphFactory`
- `RuntimeDetachedFactory`
- `detachedOpen.ts`
- `RuntimePatchCollector`
- `RuntimeStateStore`

Those files still named `WarpRuntime` directly even though each of them only
needed a much narrower seam.

## Hill

The runtime helper wrappers stop importing `WarpRuntime` directly and instead
depend on explicit helper surfaces that match the behavior they actually need.

## Playback questions

### Agent

- Do the helper-wrapper files stop importing `WarpRuntime` directly?
- Does `RuntimePatchCollector` stop relying on adapter casts for checkpoint
  passthrough?
- Does `API_kill-warpruntime` drop this successor from its blocker list?

### Human

- Is the remaining runtime kill now clearly concentrated in the
  runtime-wiring / `_wiredMethods` surface?

## Non-goals

- No runtime-wiring deletion in this slice
- No `WarpRuntime` deletion in this slice

## Test plan

### RED

Add a shape ratchet that fails until:

- the helper-wrapper files stop importing `WarpRuntime`
- `RuntimePatchCollector.ts` stops using adapter casts

### GREEN

- define explicit helper surfaces for detached reads and wrapper hosts
- move wrapper files onto those surfaces
- update the runtime-kill umbrella and release ledger to reflect the remaining
  single blocker

### Witness

- `npm exec vitest run test/unit/scripts/runtime-helper-wrapper-seams.test.ts test/unit/domain/services/controllers/QueryController.test.ts test/unit/domain/WarpGraph.public-sync.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. The helper-wrapper files no longer import `WarpRuntime` directly.
- Yes. `RuntimePatchCollector.ts` no longer relies on adapter casts.
- Yes. `API_kill-warpruntime` no longer waits on this successor.

### Human

- Yes. The remaining runtime kill is now concentrated in the
  runtime-wiring / `_wiredMethods` surface.

### Verdict

`hill met`

## Drift check

No negative drift.
