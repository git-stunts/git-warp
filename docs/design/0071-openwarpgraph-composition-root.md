---
title: "Move public boot off WarpRuntime.open"
cycle: "0071-openwarpgraph-composition-root"
---

# Move Public Boot Off WarpRuntime.open

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

After `0069` and `0070`, the next explicit `WarpRuntime` kill cut was the
composition root:

- `src/domain/warp/WarpGraphRuntimeBridge.ts`
- `src/domain/warp/WarpCoreRuntimeBridge.ts`
- the static `WarpRuntime.open()` hotspot

The bridges no longer imported the class directly, but they were still teaching
the public boot path as “call `WarpRuntime.open()` and adopt the result.”

## Hill

Move runtime boot orchestration out of the `WarpRuntime.open()` hotspot into a
dedicated boot module, make the public bridges depend on that module instead of
the runtime class, and update the runtime-kill umbrella so the remaining order
starts at controller host typing.

## Playback questions

### Agent

- Do the bridge files stop importing `WarpRuntime` directly?
- Do the bridge files stop calling `WarpRuntime.open()` directly?
- Does the `API_kill-warpruntime` umbrella drop the composition-root blocker?

### Human

- If I inspect the public boot path now, is the remaining runtime residue
  clearly about host typing and the `_internal` shim rather than public boot?

## Non-goals

- No controller host-type cleanup in this slice
- No `_internal.ts` deletion in this slice
- No `WarpRuntime` deletion in this slice

## Test plan

### RED

Add a shape ratchet that fails until:

- `WarpGraphRuntimeBridge.ts` and `WarpCoreRuntimeBridge.ts` stop importing
  `WarpRuntime`
- those bridges stop calling `WarpRuntime.open()`
- boot orchestration is delegated into a dedicated runtime-boot module

### GREEN

- add a runtime-boot module for open-time orchestration
- make `WarpRuntime.open()` a thin wrapper
- make both bridges depend on the named boot seam instead of the class
- update the runtime-kill umbrella and release ledger

### Witness

- `npm exec vitest run test/unit/scripts/openwarpgraph-composition-root.test.ts test/unit/scripts/warpcore-runtime-bridge.test.ts test/unit/scripts/warpgraph-capability-seam.test.ts test/unit/scripts/kill-warpruntime-split.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. The bridge files stop importing `WarpRuntime` directly.
- Yes. The bridge files stop calling `WarpRuntime.open()` directly.
- Yes. The runtime-kill umbrella drops the composition-root blocker.

### Human

- Yes. The remaining runtime residue is now clearly controller host typing plus
  the `_internal` shim.

### Verdict

`hill met`

## Drift check

No negative drift.
