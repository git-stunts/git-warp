---
title: "Extract runtime host product"
cycle: "0078-extract-runtime-host-product"
---

# Extract Runtime Host Product

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

After `0077`, the remaining source-side `WarpRuntime` residue is concentrated in
three files:

- [WarpGraphRuntimeProduct.ts](../../src/domain/warp/WarpGraphRuntimeProduct.ts)
- [WarpCoreRuntimeProduct.ts](../../src/domain/warp/WarpCoreRuntimeProduct.ts)
- [ForkController.ts](../../src/domain/services/controllers/ForkController.ts)

All three still reach `openWarpRuntime(...)` or derive types from that surface.
That means the `WarpRuntime.ts` file delete is still blocked by one source-side
host seam, even after the graph bridge, core bridge, controller host types, and
internal shim all died.

## Hill

Extract a named internal runtime-host product seam so the two runtime product
builders and `ForkController` stop importing or dynamically importing
`WarpRuntime.ts`, while preserving the current runtime behavior and leaving the
remaining class delete as a test/helper migration problem.

## Playback questions

### Agent

- Do `WarpGraphRuntimeProduct.ts` and `WarpCoreRuntimeProduct.ts` stop importing
  `../WarpRuntime.ts`?
- Does `ForkController.ts` stop typing against or dynamically importing
  `../../WarpRuntime.ts`?
- Is there now one explicit host-product seam that owns the internal
  `openWarpRuntime(...)` call?

### Human

- If I inspect the remaining source-side runtime boot path, does it read as one
  named internal host product rather than three separate `WarpRuntime` escape
  hatches?

## Accessibility / assistive reading posture

Not user-facing. No additional accessibility posture is required beyond keeping
the seam naming explicit and local.

## Localization / directionality posture

Not user-facing. No localization or directionality impact.

## Agent inspectability / explainability posture

The host-product seam must be repo-inspectable. A reader should be able to
answer "where does source code still open the runtime host?" by reading one
named file instead of scanning multiple runtime product builders and
controllers.

## Non-goals

- No `WarpRuntime.ts` file deletion in this slice
- No broad test/helper migration off `WarpRuntime`
- No public API contract changes for `openWarpGraph()` or `WarpCore.open()`

## Test plan

### RED

Add ratchets that fail until:

- a dedicated `RuntimeHostProduct.ts` seam exists
- the two runtime product builders no longer import `../WarpRuntime.ts`
- `ForkController.ts` no longer imports or dynamically imports `WarpRuntime.ts`

### GREEN

- add the internal host-product seam
- move `WarpGraphRuntimeProduct.ts`, `WarpCoreRuntimeProduct.ts`, and
  `ForkController.ts` onto it
- keep the runtime-kill ledger and workload map honest

### Witness

- `npm exec vitest run test/unit/scripts/runtime-host-product-seam.test.ts test/unit/scripts/openwarpgraph-composition-root.test.ts test/unit/scripts/runtime-controller-host-types.test.ts test/unit/domain/services/controllers/ForkController.test.ts test/unit/domain/warp/WarpGraphRuntimeBridge.test.ts test/unit/domain/WarpCore.content.test.ts test/unit/scripts/delete-warpruntime-class-split.test.ts test/unit/scripts/kill-warpruntime-split.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. `WarpGraphRuntimeProduct.ts` and `WarpCoreRuntimeProduct.ts` now stop
  importing `../WarpRuntime.ts`.
- Yes. `ForkController.ts` now stops typing against or dynamically importing
  `../../WarpRuntime.ts`.
- Yes. There is now one explicit host-product seam,
  [RuntimeHostProduct.ts](../../src/domain/warp/RuntimeHostProduct.ts),
  that owns the internal `openWarpRuntime(...)` call.

### Human

- Yes. The remaining source-side runtime boot path now reads as one named
  internal host product instead of three separate `WarpRuntime` escape hatches.

### Verdict

`hill met`

## Drift check

No negative drift.
