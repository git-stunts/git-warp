# 0063 WarpApp Capability Bridge

- Outcome: `hill met`
- Cycle doc: [docs/design/0063-warpapp-capability-bridge.md](../../../design/0063-warpapp-capability-bridge.md)

## What changed

- `WarpApp.ts` no longer imports `WarpRuntime`
- the app facade now names an explicit adopted-core surface
- content reads delegate through that surface directly

## Why it mattered

This removes the direct runtime fiction from the product-facing facade and
leaves the remaining bridge residue isolated in `WarpCore`.

## Witness

- `npm exec vitest run test/unit/scripts/warpapp-capability-bridge.test.ts test/unit/domain/WarpApp.facade.test.ts test/unit/domain/WarpApp.delegation.test.ts`
- `npm run typecheck`
- `git diff --check`
