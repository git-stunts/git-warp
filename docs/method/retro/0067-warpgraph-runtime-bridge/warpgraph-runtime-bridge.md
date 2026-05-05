# 0067 WarpGraph Runtime Bridge

- Outcome: `hill met`
- Cycle doc: [docs/design/0067-warpgraph-runtime-bridge.md](../../../design/0067-warpgraph-runtime-bridge.md)

## What changed

- `WarpGraph.ts` no longer imports `WarpRuntime`
- `openWarpGraph()` now opens through `warp/WarpGraphRuntimeBridge.ts`
- `API_kill-warpruntime` no longer waits on the composition-root bridge cut

## Why it mattered

This removes the direct runtime type from the public composition root and
shrinks the remaining runtime deletion work to the helper-wrapper and
runtime-wiring surfaces.

## Witness

- `npm exec vitest run test/unit/scripts/warpgraph-capability-seam.test.ts test/unit/domain/WarpGraph.public-sync.test.ts`
- `npm run typecheck`
- `git diff --check`
