---
title: "Resplit WarpRuntime kill after shim closeout"
cycle: "0074-kill-warpruntime-resplit-after-shim"
---

# Resplit WarpRuntime Kill After Shim Closeout

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

Cycle `0073` deleted the `_internal.ts` compatibility shim, which means
`API_kill-warpruntime` is now exposed again.

Repo truth still says it is not one executable slice:

- [WarpGraphRuntimeBridge.ts](../../src/domain/warp/WarpGraphRuntimeBridge.ts)
  still calls `openWarpRuntime()`
- WarpCoreRuntimeBridge.ts
  still calls `openWarpRuntime()` and links `WarpCore.prototype` onto the
  runtime prototype
- [WarpCore.ts](../../src/domain/WarpCore.ts)
  still routes substrate calls through `callInternalRuntimeMethod(...)`
- tests and helpers still treat `WarpRuntime` as the primary graph object

Leaving the umbrella as one live note would just recreate the same fake
mega-slice in a new shape.

## Hill

Rewrite `API_kill-warpruntime` around three explicit remaining cuts:

- `API_delete-openwarpruntime-bridge`
- `PORT_delete-warpcore-runtime-bridge`
- `API_delete-warpruntime-class`

## Playback questions

### Agent

- Does `API_kill-warpruntime` stop claiming it is the direct next cut?
- Are the three remaining slices named as backlog notes with explicit edges?
- Do the `v17` ledger and kill split ratchet describe the same order?

### Human

- If I inspect the `v17` runtime-kill plan now, do I know exactly which
  surfaces must land before the class can die?

## Non-goals

- No runtime code changes in this slice
- No `WarpRuntime` deletion in this slice

## Test plan

### RED

Update the split ratchet so it fails until:

- `API_kill-warpruntime` is rewritten as an umbrella blocked by the final
  delete cut
- the three successor notes exist
- the release ledger names the same order

### GREEN

- add the three successor notes
- rewrite `API_kill-warpruntime` around them
- update the `v17` ledger and workload row
- refresh backlog counts

### Witness

- `npm exec vitest run test/unit/scripts/kill-warpruntime-split.test.ts test/unit/scripts/backlog-feature-scope.test.ts`
- `git diff --check`

## Playback

### Agent

- Yes. `API_kill-warpruntime` now reads as an umbrella, not the direct next cut.
- Yes. The three remaining slices are explicit backlog notes with explicit
  blocker relationships.
- Yes. The `v17` ledger and the kill split ratchet now describe the same
  order.

### Human

- Yes. The plan is now explicit: delete the `openWarpRuntime` bridge, delete
  the `WarpCore` runtime bridge, then delete the class and exports.

### Verdict

`hill met`

## Drift check

No negative drift.
