---
title: "Resplit WarpRuntime class delete"
cycle: "0077-delete-warpruntime-class-resplit"
---

# Resplit WarpRuntime Class Delete

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

After `0076`, API_delete-warpruntime-class
looked executable on paper, but repo truth says otherwise.

The remaining class residue falls into two distinct cuts:

1. **Source/runtime host residue**
   - [WarpGraphRuntimeProduct.ts](../../src/domain/warp/WarpGraphRuntimeProduct.ts)
   - [WarpCoreRuntimeProduct.ts](../../src/domain/warp/WarpCoreRuntimeProduct.ts)
   - [ForkController.ts](../../src/domain/services/controllers/ForkController.ts)
   - all still reach `openWarpRuntime(...)` or type against it
2. **Legacy test/helper/seed surface**
   - dozens of unit, integration, bats, and helper files still import
     `WarpRuntime` directly or assert `instanceof WarpRuntime`

That means the class delete is still an umbrella over at least two real
successor cuts.

## Hill

Rewrite `API_delete-warpruntime-class` as an umbrella over the real remaining
pre-delete cuts so the backlog, release ledger, and workload map stop teaching
the final runtime delete as one patch.

## Playback questions

### Agent

- Does `API_delete-warpruntime-class` now declare the real successor blockers?
- Are the new successor notes explicit about source/runtime-host residue vs
  test/helper migration residue?
- Do the `v17` release ledger and workloads reflect the new order?

### Human

- If I inspect the runtime-kill plan now, does it tell me what I actually have
  to do before deleting `WarpRuntime.ts`?

## Non-goals

- No `WarpRuntime.ts` code deletion in this slice
- No test migration in this slice
- No runtime-host extraction in this slice

## Test plan

### RED

Add a ratchet that fails until:

- `API_delete-warpruntime-class.md` is blocked by the new successor notes
- the new successor notes exist
- the `v17` release ledger records the new order

### GREEN

- add the successor notes
- rewrite the class-delete note as the umbrella over them
- update the `v17` release ledger, workload map, and backlog counts

### Witness

- `npm exec vitest run test/unit/scripts/delete-warpruntime-class-split.test.ts test/unit/scripts/kill-warpruntime-split.test.ts`
- `git diff --check`

## Playback

### Agent

- Yes. `API_delete-warpruntime-class` now declares the real successor blockers.
- Yes. The new successor notes explicitly separate runtime-host extraction from
  test/helper migration.
- Yes. The `v17` release ledger and workload map now reflect that order.

### Human

- Yes. The runtime-kill plan now says what actually remains before
  `WarpRuntime.ts` can die.

### Verdict

`hill met`

## Drift check

No negative drift.
