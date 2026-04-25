---
title: "Delete openWarpRuntime bridge under openWarpGraph"
cycle: "0075-delete-openwarpruntime-bridge"
---

# Delete openWarpRuntime Bridge Under openWarpGraph

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

After `0074`, the first explicit remaining cut under `API_kill-warpruntime`
is the public factory bridge:

- [WarpGraphRuntimeBridge.ts](/Users/james/git/git-stunts/git-warp/src/domain/warp/WarpGraphRuntimeBridge.ts)
  still imports `../WarpRuntime.ts`
- it still reaches the runtime boot path through `openWarpRuntime()`
- the bridge product is still the runtime instance itself rather than an honest
  graph-runtime surface

That means `openWarpGraph()` is still indirectly teaching `WarpRuntime` as the
product behind the public capability bag.

## Hill

Make `WarpGraphRuntimeBridge.ts` depend on a non-class runtime product seam so
the bridge no longer imports `../WarpRuntime.ts`, no longer calls
`openWarpRuntime()`, and no longer returns a `WarpRuntime` instance.

## Playback questions

### Agent

- Does `WarpGraphRuntimeBridge.ts` stop importing `../WarpRuntime.ts`?
- Does it stop calling `openWarpRuntime()`?
- Does the bridge return a plain structural runtime surface instead of a
  `WarpRuntime` instance?

### Human

- If I inspect the public factory path now, does `openWarpGraph()` read as a
  capability composition root over a graph-runtime surface rather than over the
  runtime class?

## Non-goals

- No `WarpCore` bridge deletion in this slice
- No `WarpRuntime` class deletion in this slice
- No broad test migration away from `WarpRuntime.open()` in this slice

## Test plan

### RED

Add a ratchet that fails until:

- `WarpGraphRuntimeBridge.ts` no longer imports `../WarpRuntime.ts`
- `WarpGraphRuntimeBridge.ts` no longer calls `openWarpRuntime()`
- `openWarpGraphRuntime(...)` returns something that is not a `WarpRuntime`
  instance

### GREEN

- introduce a dedicated runtime-surface opener for `openWarpGraph()`
- make `WarpGraphRuntimeBridge.ts` depend on that opener instead of
  `../WarpRuntime.ts`
- keep the existing public capability bag behavior intact
- update the runtime-kill ledger and workload map

### Witness

- `npm exec vitest run test/unit/scripts/openwarpruntime-bridge-closeout.test.ts test/unit/scripts/kill-warpruntime-split.test.ts test/unit/domain/warp/WarpGraphRuntimeBridge.test.ts test/unit/domain/WarpGraph.public-sync.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. `WarpGraphRuntimeBridge.ts` no longer imports `../WarpRuntime.ts`.
- Yes. `WarpGraphRuntimeBridge.ts` no longer calls `openWarpRuntime()`.
- Yes. `openWarpGraphRuntime(...)` now returns a frozen structural runtime
  surface instead of a `WarpRuntime` instance.

### Human

- Yes. `openWarpGraph()` now reads as a capability composition root over a
  graph-runtime surface rather than as a thin bridge to the runtime class.

### Verdict

`hill met`

## Drift check

No negative drift.
