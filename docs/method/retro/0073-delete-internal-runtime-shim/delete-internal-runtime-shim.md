# 0073 Delete Internal Runtime Shim

- Outcome: `hill met`
- Cycle doc: [docs/design/0073-delete-internal-runtime-shim.md](../../../design/0073-delete-internal-runtime-shim.md)

## What changed

- deleted src/domain/warp/_internal.ts
- moved shared query-state strings into [QueryStateMessages.ts](../../../../src/domain/services/controllers/QueryStateMessages.ts)
- replaced `WarpGraphWithMixins` host assumptions with explicit structural
  read-host contracts in [ReadGraphHost.ts](../../../../src/domain/services/controllers/ReadGraphHost.ts)
- updated the runtime-kill ledger so `API_kill-warpruntime` is no longer
  blocked by the shim

## Why it mattered

This removes the last fake shared runtime alias below the kill umbrella. The
remaining runtime kill is now the real runtime/class deletion problem, not
compatibility residue.

## Witness

- `npm exec vitest run test/unit/scripts/internal-runtime-shim-closeout.test.ts test/unit/scripts/kill-warpruntime-split.test.ts test/unit/domain/services/controllers/PatchController.test.ts test/unit/domain/services/controllers/CheckpointController.test.ts test/unit/domain/services/controllers/CheckpointController.snapshotCache.test.ts test/unit/domain/services/controllers/QueryController.test.ts`
- `npm run typecheck`
- `git diff --check`
