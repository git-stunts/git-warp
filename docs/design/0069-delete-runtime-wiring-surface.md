---
title: "Delete runtime wiring and _wiredMethods surface"
cycle: "0069-delete-runtime-wiring-surface"
---

# Delete Runtime Wiring And _wiredMethods Surface

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

After `0067` and `0068`, the final explicit blocker on
`API_kill-warpruntime` was the old wiring surface:

- `src/domain/runtimeWiring.ts`
- `src/domain/warp/_wiredMethods.d.ts`
- the `wireRuntime(WarpRuntime)` defineProperty delegation story

That surface was still teaching TypeScript and readers a runtime lie:
`WarpRuntime` looked like a normal static class contract only because a deleted
declaration file and a runtime patcher agreed to cosplay together.

## Hill

Delete the runtime-wiring shim and `_wiredMethods` declaration surface, move the
remaining methods onto `WarpRuntime` directly, and update repo truth so the
runtime-kill umbrella no longer waits on a deleted blocker.

## Playback questions

### Agent

- Are `runtimeWiring.ts` and `_wiredMethods.d.ts` both gone?
- Does `WarpRuntime.ts` now carry the formerly wired surface directly?
- Does the `v17` ledger stop teaching the deleted blocker as still open?

### Human

- If I inspect the runtime surface now, is the last remaining `WarpRuntime`
  work obviously composition-root and host-typing residue rather than hidden
  defineProperty machinery?

## Non-goals

- No `WarpRuntime` deletion in this slice
- No composition-root rewrite in this slice
- No controller host-type cleanup in this slice

## Test plan

### RED

Add a shape ratchet that fails until:

- `runtimeWiring.ts` is deleted
- `_wiredMethods.d.ts` is deleted
- tsconfig no longer references the deleted shim
- `WarpRuntime.ts` carries a direct static surface

### GREEN

- move the remaining runtime methods onto `WarpRuntime.ts`
- delete the runtime-wiring shim and `_wiredMethods` declaration file
- retire the now-satisfied `_wiredMethods` bad-code note
- update the release ledger and backlog surfaces

### Witness

- `npm exec vitest run test/unit/scripts/runtime-wiring-surface-closeout.test.ts test/unit/scripts/public-api-cost-signaling.test.ts test/unit/scripts/public-api-strand-noun.test.ts test/unit/scripts/non-ts-tail-shape.test.ts test/unit/domain/WarpGraph.test.ts test/unit/domain/WarpGraph.coverageGaps.test.ts test/unit/scripts/warpgraph-capability-seam.test.ts test/unit/domain/WarpGraph.public-sync.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. `runtimeWiring.ts` and `_wiredMethods.d.ts` are both gone.
- Yes. `WarpRuntime.ts` now carries the formerly wired surface directly.
- Yes. The `v17` ledger no longer teaches `PROTO_delete-runtime-wiring-surface`
  as a live blocker or `_wiredMethods.d.ts` as part of the remaining non-TS
  tail.

### Human

- Yes. The remaining `WarpRuntime` work is now clearly composition-root and
  host-type residue rather than hidden runtime wiring.

### Verdict

`hill met`

## Drift check

No negative drift.
