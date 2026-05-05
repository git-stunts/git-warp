# 0064 WarpCore Runtime Bridge

- Outcome: `hill met`
- Cycle doc: [docs/design/0064-warpcore-runtime-bridge.md](../../../design/0064-warpcore-runtime-bridge.md)

## What changed

- `WarpCore.ts` no longer imports `WarpRuntime`
- strand and comparison methods now route through the internal runtime-call
  helper instead of `WarpRuntime.prototype.*`
- strand patch list options now use an explicit ceiling-shaped type
- `WarpCore.ts` graduated from the boundary quarantine

## Why it mattered

This isolates the last public facade file from direct runtime typing and makes
the remaining migration residue obvious: the composition root still binds a
live `WarpRuntime`, but the facade layer no longer pretends to be the runtime.

## Witness

- `npm exec vitest run test/unit/scripts/warpcore-runtime-bridge.test.ts test/unit/domain/WarpCore.content.test.ts test/unit/domain/WarpCore.effectPipeline.test.ts test/unit/domain/WarpCore.emit.test.ts`
- `npm run typecheck`
- `git diff --check`
