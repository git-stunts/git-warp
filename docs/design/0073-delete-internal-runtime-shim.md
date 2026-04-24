---
title: "Delete internal runtime shim"
cycle: "0073-delete-internal-runtime-shim"
---

# Delete Internal Runtime Shim

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

After `0072`, the only explicit blocker left under `API_kill-warpruntime` was
`src/domain/warp/_internal.ts`. That file had collapsed into a compatibility
alias for:

- `WarpGraphWithMixins`
- `QueryError` / `ForkError` / `StrandError` re-exports
- the stale-state / no-state query messages

Keeping that shim around would keep teaching a fake shared runtime surface even
though the real owners already existed.

## Hill

Delete `src/domain/warp/_internal.ts`, move any surviving shared constants or
host shapes to honest owners, and clear `PORT_delete-internal-runtime-shim` as
the last explicit blocker under `API_kill-warpruntime`.

## Playback questions

### Agent

- Does `src/domain/warp/_internal.ts` disappear completely?
- Do the touched controller seams stop importing `warp/_internal` and instead
  use honest owners for query messages, host shapes, and errors?
- Does `API_kill-warpruntime` become unblocked in the release ledger?

### Human

- If I inspect the runtime-kill plan now, is `API_kill-warpruntime` exposed as
  the next live cut instead of hiding behind `_internal.ts`?

## Non-goals

- No `WarpRuntime` deletion in this slice
- No composition-root rewrite beyond the already-shipped `0071` cut
- No broader controller refactor beyond removing the shim dependency

## Test plan

### RED

Add a closeout ratchet that fails until:

- `_internal.ts` no longer exists
- the touched controller files stop importing `warp/_internal`
- the runtime-kill split test stops expecting the shim as a blocker

### GREEN

- delete `_internal.ts`
- move query-state strings to a dedicated controller owner
- replace `WarpGraphWithMixins` usage with explicit structural host contracts
- update the runtime-kill umbrella and release ledger

### Witness

- `npm exec vitest run test/unit/scripts/internal-runtime-shim-closeout.test.ts test/unit/scripts/kill-warpruntime-split.test.ts test/unit/domain/services/controllers/PatchController.test.ts test/unit/domain/services/controllers/CheckpointController.test.ts test/unit/domain/services/controllers/CheckpointController.snapshotCache.test.ts test/unit/domain/services/controllers/QueryController.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. `src/domain/warp/_internal.ts` is deleted.
- Yes. The touched controller seams now use `QueryStateMessages.ts`,
  `ReadGraphHost.ts`, and direct error owners instead of `warp/_internal`.
- Yes. `API_kill-warpruntime` is now unblocked in the release ledger.

### Human

- Yes. The runtime-kill plan now exposes `API_kill-warpruntime` as the next
  live cut instead of hiding behind the shim.

### Verdict

`hill met`

## Drift check

No negative drift.
