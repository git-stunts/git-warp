---
title: "Remove direct WarpRuntime typing from WarpGraph"
cycle: "0067-warpgraph-runtime-bridge"
---

# Remove Direct WarpRuntime Typing From WarpGraph

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

After `0066`, the first explicit successor under `API_kill-warpruntime` is the
composition root.

`WarpGraph.ts` still imported `WarpRuntime` directly and still bound the public
capability bag by calling `WarpRuntime.open(...)`.

That meant the public composition root was still teaching runtime as the
factory truth even though the public surface is supposed to be a frozen
capability bag.

## Hill

`WarpGraph.ts` no longer imports `WarpRuntime` directly and opens the runtime
through an explicit bridge seam instead.

## Playback questions

### Agent

- Does `WarpGraph.ts` stop importing `WarpRuntime`?
- Does `openWarpGraph()` stop calling `WarpRuntime.open(...)` directly?
- Is the public capability bag still wired and tested without regression?

### Human

- Can I read `WarpGraph.ts` and understand it as the public composition root
  over a bridge seam rather than as a thin `WarpRuntime` wrapper?

## Non-goals

- No runtime helper wrapper cleanup in this slice
- No runtime wiring / `_wiredMethods` deletion in this slice
- No `WarpRuntime` deletion in this slice

## Test plan

### RED

Extend the existing WarpGraph seam ratchet until it also fails on a direct
`WarpRuntime` import.

### GREEN

- move the runtime-dependent opener/type residue into a dedicated
  `WarpGraphRuntimeBridge`
- keep `WarpGraph.ts` focused on capability binding over the bridge surface
- update the runtime-kill umbrella to drop this successor from its blocker list

### Witness

- `npm exec vitest run test/unit/scripts/warpgraph-capability-seam.test.ts test/unit/domain/WarpGraph.public-sync.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. `WarpGraph.ts` no longer imports `WarpRuntime`.
- Yes. `openWarpGraph()` no longer calls `WarpRuntime.open(...)` directly.
- Yes. The public seam tests still pass.

### Human

- Yes. `WarpGraph.ts` now reads like a composition root over a runtime bridge
  instead of a direct runtime factory wrapper.

### Verdict

`hill met`

## Drift check

No negative drift.
