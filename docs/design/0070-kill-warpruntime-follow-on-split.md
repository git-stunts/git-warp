---
title: "Resplit WarpRuntime deletion after wiring closeout"
cycle: "0070-kill-warpruntime-follow-on-split"
---

# Resplit WarpRuntime Deletion After Wiring Closeout

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

Cycle `0069` deleted the old runtime-wiring / `_wiredMethods` blocker, which
means `API_kill-warpruntime` is no longer blocked in the old sense.

But repo truth after that closeout is still not “delete the class now”:

- `WarpGraphRuntimeBridge.ts` and `WarpCoreRuntimeBridge.ts` still call
  `WarpRuntime.open()`
- several controller/service seams still type against `WarpRuntime`
- `_internal.ts` still exists as a compatibility alias

Pretending that is one executable slice would just recreate the same giant
runtime-kill fiction in a new shape.

## Hill

Rewrite `API_kill-warpruntime` around the three remaining explicit cuts:

- `API_openwarpgraph-composition-root`
- `PORT_delete-runtime-controller-host-types`
- `PORT_delete-internal-runtime-shim`

## Playback questions

### Agent

- Does `API_kill-warpruntime` stop pretending the remaining residue is one
  direct delete?
- Are the three remaining cuts named explicitly as backlog items?
- Do the release ledger and workload map point at the same split?

### Human

- If I look at the `v17` backlog now, do I know the exact remaining order for
  deleting `WarpRuntime` honestly?

## Non-goals

- No runtime code changes in this slice
- No `WarpRuntime` deletion in this slice

## Test plan

### RED

Update the runtime-kill split ratchet so it fails until:

- `API_kill-warpruntime` is blocked by the three new remaining cuts
- the release ledger names the same split

### GREEN

- add the three successor notes
- rewrite the umbrella note around them
- update the `v17` release ledger and workload map
- remove stale `_wiredMethods.d.ts` launch-prep references from
  `TS_publish-pipeline.md`

### Witness

- `npm exec vitest run test/unit/scripts/kill-warpruntime-split.test.ts test/unit/scripts/backlog-feature-scope.test.ts`
- `git diff --check`

## Playback

### Agent

- Yes. `API_kill-warpruntime` no longer pretends the remaining residue is one
  direct delete.
- Yes. The three remaining cuts are explicit backlog notes.
- Yes. The release ledger and workload map now point at the same split.

### Human

- Yes. The remaining order is explicit: composition root, controller host
  types, then `_internal.ts`.

### Verdict

`hill met`

## Drift check

No negative drift.
