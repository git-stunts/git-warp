# 0076 Delete WarpCore Runtime Bridge

- Outcome: `hill met`
- Cycle doc: [docs/design/0076-delete-warpcore-runtime-bridge.md](/Users/james/git/git-stunts/git-warp/docs/design/0076-delete-warpcore-runtime-bridge.md)

## What changed

- deleted [WarpCoreRuntimeBridge.ts](/Users/james/git/git-stunts/git-warp/src/domain/warp/WarpCoreRuntimeBridge.ts)
- added [WarpCoreRuntimeProduct.ts](/Users/james/git/git-stunts/git-warp/src/domain/warp/WarpCoreRuntimeProduct.ts)
  as the structural core product seam
- updated [WarpCore.ts](/Users/james/git/git-stunts/git-warp/src/domain/WarpCore.ts)
  so `WarpCore.open()` now adopts the explicit runtime product surface instead
  of linking onto the runtime bridge
- updated the closeout and composition-root ratchets:
  - [warpcore-runtime-bridge.test.ts](/Users/james/git/git-stunts/git-warp/test/unit/scripts/warpcore-runtime-bridge.test.ts)
  - [openwarpgraph-composition-root.test.ts](/Users/james/git/git-stunts/git-warp/test/unit/scripts/openwarpgraph-composition-root.test.ts)
- advanced the runtime-kill chain so the remaining order is now:
  `API_delete-warpruntime-class` → `API_kill-warpruntime`

## Why it mattered

This removes the last `WarpCore` dependency on the bridge-era runtime aliasing
scheme. `WarpCore` now composes over an explicit product seam instead of asking
the runtime class to masquerade as its substrate.

## Witness

- `npm exec vitest run test/unit/scripts/warpcore-runtime-bridge.test.ts test/unit/scripts/openwarpgraph-composition-root.test.ts test/unit/domain/WarpCore.content.test.ts test/unit/domain/WarpCore.effectPipeline.test.ts test/unit/domain/WarpCore.emit.test.ts test/unit/domain/WarpGraph.strands.test.ts test/unit/domain/WarpGraph.conflicts.test.ts test/unit/domain/WarpGraph.worldline.test.ts test/unit/domain/WarpGraph.observerBoundary.test.ts test/unit/scripts/kill-warpruntime-split.test.ts`
- `npm run typecheck`
- `git diff --check`
