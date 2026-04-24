# 0071 OpenWarpGraph Composition Root

- Outcome: `hill met`
- Cycle doc: [docs/design/0071-openwarpgraph-composition-root.md](/Users/james/git/git-stunts/git-warp/docs/design/0071-openwarpgraph-composition-root.md)

## What changed

- added [WarpRuntimeBoot.ts](/Users/james/git/git-stunts/git-warp/src/domain/warp/WarpRuntimeBoot.ts)
  for runtime open-time orchestration
- `WarpRuntime.open()` now delegates through a thin wrapper instead of carrying
  the whole boot hotspot inline
- `WarpGraphRuntimeBridge.ts` and `WarpCoreRuntimeBridge.ts` now depend on the
  named boot seam instead of importing `WarpRuntime`
- `API_kill-warpruntime` no longer waits on the composition-root cut

## Why it mattered

This removes the last public boot lie from the runtime-kill sequence. The
remaining runtime residue is now controller/service host typing and the
`_internal.ts` shim.

## Witness

- `npm exec vitest run test/unit/scripts/openwarpgraph-composition-root.test.ts test/unit/scripts/warpcore-runtime-bridge.test.ts test/unit/scripts/warpgraph-capability-seam.test.ts test/unit/scripts/kill-warpruntime-split.test.ts`
- `npm run typecheck`
- `git diff --check`
