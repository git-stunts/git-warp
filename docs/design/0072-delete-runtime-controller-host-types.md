---
title: "Delete runtime controller host types"
cycle: "0072-delete-runtime-controller-host-types"
---

# Delete Runtime Controller Host Types

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

After `0071`, the next explicit `WarpRuntime` kill blocker was no longer public
boot. It was the handful of controller and strand seams still teaching the
runtime class as their host type:

- `StrandController.ts`
- `ConflictAnalyzerService.ts`
- `CheckpointController.ts`
- `PatchController.ts`
- `ForkController.ts`
- `SyncControllerTypes.ts`

That residue made the final kill look smaller than it really was.

## Hill

Replace the remaining direct `WarpRuntime` controller/service host typing with
explicit structural contracts, and make `ForkController` reopen forks through
the named runtime boot function instead of the runtime class.

## Playback questions

### Agent

- Do the targeted controller and strand files stop importing `WarpRuntime`
  directly?
- Do the checkpoint, patch, and sync seams stop deriving host fields through
  `WarpRuntime['...']`?
- Does `ForkController` stop calling `WarpRuntime.open()`?

### Human

- If I inspect the runtime-kill ledger now, is the only remaining blocker the
  `_internal.ts` shim?

## Non-goals

- No `_internal.ts` deletion in this slice
- No `WarpRuntime` deletion in this slice
- No broader query/materialize controller cleanup beyond the direct host-type
  residue named above

## Test plan

### RED

Add a shape ratchet that fails until:

- the targeted controller and strand files stop importing `WarpRuntime`
- checkpoint, patch, and sync host contracts stop indexing into
  `WarpRuntime['...']`
- `ForkController` stops reopening forks through `WarpRuntime.open()`

### GREEN

- replace the remaining direct `WarpRuntime` host types with structural seams
- remove the `as unknown as` bridge in `StrandController`
- route fork reopen through the named runtime boot function
- update the runtime-kill umbrella and release ledger

### Witness

- `npm exec vitest run test/unit/scripts/runtime-controller-host-types.test.ts test/unit/domain/WarpGraph.fork.test.ts test/unit/domain/WarpGraph.conflicts.test.ts test/unit/domain/WarpGraph.strands.test.ts test/unit/domain/services/controllers/CheckpointController.test.ts test/unit/domain/services/SyncController.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. The targeted controller and strand files stop importing `WarpRuntime`
  directly.
- Yes. The checkpoint, patch, and sync seams stop deriving host fields through
  `WarpRuntime['...']`.
- Yes. `ForkController` now reopens forks through `openWarpRuntime()`.

### Human

- Yes. The runtime-kill ledger now reduces the remaining order to the
  `_internal.ts` shim.

### Verdict

`hill met`

## Drift check

No negative drift.
