# 0078 Extract Runtime Host Product

- Outcome: `hill met`
- Cycle doc: [docs/design/0078-extract-runtime-host-product.md](../../../design/0078-extract-runtime-host-product.md)

## What changed

- added [RuntimeHostProduct.ts](../../../../src/domain/warp/RuntimeHostProduct.ts)
  as the single internal owner of the `openWarpRuntime(...)` call
- updated [WarpGraphRuntimeProduct.ts](../../../../src/domain/warp/WarpGraphRuntimeProduct.ts)
  and [WarpCoreRuntimeProduct.ts](../../../../src/domain/warp/WarpCoreRuntimeProduct.ts)
  so both runtime product builders now consume the shared host seam instead of
  importing `WarpRuntime.ts` directly
- updated [ForkController.ts](../../../../src/domain/services/controllers/ForkController.ts)
  so fork reopen flows through the host seam instead of its own runtime-module
  import
- updated the runtime-kill ledger so the remaining order is now:
  `DX_migrate-tests-and-seed-helpers-off-warpruntime` →
  `API_delete-warpruntime-class` →
  `API_kill-warpruntime`
- refreshed the ratchets, now carried by executable replacement evidence:
  - [runtimeProductExecutableSurface.test.ts](../../../../test/unit/domain/runtimeProductExecutableSurface.test.ts)
  - [publicStrandAndRuntimeSeams.test.ts](../../../../test/unit/domain/publicStrandAndRuntimeSeams.test.ts)
  - [openwarpgraph-composition-root.test.ts](../../../../test/unit/scripts/openwarpgraph-composition-root.test.ts)
  - [WarpGraph.public-sync.test.ts](../../../../test/unit/domain/WarpGraph.public-sync.test.ts)

## Why it mattered

This deletes the last source-side habit of treating `WarpRuntime.ts` as a
shared convenience module. The runtime products and the fork path now tell one
story: there is a single internal host seam, and the class delete is blocked by
tests and helpers rather than by more hidden source imports.

## Witness

- `npm exec vitest run test/unit/domain/runtimeProductExecutableSurface.test.ts test/unit/domain/publicStrandAndRuntimeSeams.test.ts test/unit/scripts/openwarpgraph-composition-root.test.ts test/unit/domain/WarpGraph.public-sync.test.ts test/unit/domain/services/controllers/ForkController.test.ts test/unit/domain/warp/WarpGraphRuntimeBridge.test.ts test/unit/domain/WarpCore.content.test.ts`
- `npm run typecheck`
- `git diff --check`
