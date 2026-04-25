# 0075 Delete openWarpRuntime Bridge

- Outcome: `hill met`
- Cycle doc: [docs/design/0075-delete-openwarpruntime-bridge.md](/Users/james/git/git-stunts/git-warp/docs/design/0075-delete-openwarpruntime-bridge.md)

## What changed

- added [WarpGraphRuntimeProduct.ts](/Users/james/git/git-stunts/git-warp/src/domain/warp/WarpGraphRuntimeProduct.ts)
  as the honest product seam under `openWarpGraph()`
- updated [WarpGraphRuntimeBridge.ts](/Users/james/git/git-stunts/git-warp/src/domain/warp/WarpGraphRuntimeBridge.ts)
  so it no longer imports `WarpRuntime` directly and no longer calls
  `openWarpRuntime()`
- added the closeout ratchets:
  - [openwarpruntime-bridge-closeout.test.ts](/Users/james/git/git-stunts/git-warp/test/unit/scripts/openwarpruntime-bridge-closeout.test.ts)
  - [WarpGraphRuntimeBridge.test.ts](/Users/james/git/git-stunts/git-warp/test/unit/domain/warp/WarpGraphRuntimeBridge.test.ts)
- updated the runtime-kill ledger so the remaining order is now:
  `0076-delete-warpcore-runtime-bridge` →
  `API_delete-warpruntime-class` →
  `API_kill-warpruntime`

## Why it mattered

This removes the last `openWarpGraph()` dependency on `openWarpRuntime()`.
The public factory path now composes over a structural runtime surface instead
of smuggling the runtime class through a bridge alias.

## Witness

- `npm exec vitest run test/unit/scripts/openwarpruntime-bridge-closeout.test.ts test/unit/domain/warp/WarpGraphRuntimeBridge.test.ts test/unit/domain/WarpGraph.public-sync.test.ts test/unit/scripts/kill-warpruntime-split.test.ts`
- `npm run typecheck`
- `git diff --check`
