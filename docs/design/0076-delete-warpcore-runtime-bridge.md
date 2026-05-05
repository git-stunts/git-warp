---
title: "Delete WarpCore runtime bridge"
cycle: "0076-delete-warpcore-runtime-bridge"
---

# Delete WarpCore Runtime Bridge

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

After `0075`, the remaining non-delete bridge residue under
`API_kill-warpruntime` sat under `WarpCore`:

- [WarpCore.ts](../../src/domain/WarpCore.ts)
  still imported
  WarpCoreRuntimeBridge.ts
- the bridge still reopened `WarpRuntime` and linked `WarpCore.prototype`
  onto the runtime prototype
- `callInternalRuntimeMethod(...)` was still the escape hatch through that
  runtime-backed bridge

That meant `WarpCore` was still teaching the runtime class as its concrete
substrate even after the public graph bridge had been cut.

## Hill

Delete the `WarpCore` runtime bridge and replace it with an explicit structural
core product so `WarpCore.ts` no longer imports the bridge, no longer routes
through `callInternalRuntimeMethod(...)`, and no longer depends on prototype
linking to adopt the runtime surface.

## Playback questions

### Agent

- Is `WarpCoreRuntimeBridge.ts` gone?
- Does `WarpCore.ts` stop importing the deleted bridge and the
  `callInternalRuntimeMethod(...)` escape hatch?
- Does `WarpCore` now adopt an explicit structural core surface instead of
  asking the runtime bridge to patch prototypes?

### Human

- If I inspect `WarpCore` now, does it read as a plumbing-facing facade over a
  named runtime product seam rather than as a type alias for `WarpRuntime`?

## Non-goals

- No `WarpRuntime` class deletion in this slice
- No broad boot-path rewrite beyond the `WarpCore` product seam
- No publish or launch-prep work

## Test plan

### RED

Ratchet the closeout so it fails until:

- `WarpCoreRuntimeBridge.ts` no longer exists
- `WarpCore.ts` no longer imports the bridge
- `WarpCore.ts` no longer contains `callInternalRuntimeMethod`
- the composition-root tests reflect the new `WarpCoreRuntimeProduct` seam

### GREEN

- add a dedicated structural runtime product for `WarpCore`
- move `WarpCore.open()` onto that product seam
- delete the runtime bridge file
- update the runtime-kill ledger and workload map

### Witness

- `npm exec vitest run test/unit/scripts/warpcore-runtime-bridge.test.ts test/unit/scripts/openwarpgraph-composition-root.test.ts test/unit/domain/WarpCore.content.test.ts test/unit/domain/WarpCore.effectPipeline.test.ts test/unit/domain/WarpCore.emit.test.ts test/unit/domain/WarpGraph.strands.test.ts test/unit/domain/WarpGraph.conflicts.test.ts test/unit/domain/WarpGraph.worldline.test.ts test/unit/domain/WarpGraph.observerBoundary.test.ts test/unit/scripts/kill-warpruntime-split.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. `WarpCoreRuntimeBridge.ts` is gone.
- Yes. `WarpCore.ts` no longer imports the deleted bridge and no longer routes
  through `callInternalRuntimeMethod(...)`.
- Yes. `WarpCore` now adopts a structural product from
  `WarpCoreRuntimeProduct.ts` instead of relying on runtime bridge prototype
  patching.

### Human

- Yes. `WarpCore` now reads as a plumbing-facing facade over a named runtime
  product seam rather than as a disguised `WarpRuntime` instance.

### Verdict

`hill met`

## Drift check

No negative drift.
