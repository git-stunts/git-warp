# 0081 Migrate Runtime Suites Off WarpRuntime

- Outcome: `hill met`
- Cycle doc: [docs/design/0081-migrate-runtime-suites-off-warpruntime.md](../../../design/0081-migrate-runtime-suites-off-warpruntime.md)

## What changed

- added suite evidence now carried by
  [runtimeProductExecutableSurface.test.ts](../../../../test/unit/domain/runtimeProductExecutableSurface.test.ts),
  [publicReadApiExecutablePaths.test.ts](../../../../test/unit/domain/publicReadApiExecutablePaths.test.ts),
  and [publicStrandAndRuntimeSeams.test.ts](../../../../test/unit/domain/publicStrandAndRuntimeSeams.test.ts)
- moved runtime-facing unit, integration, service, and infrastructure-adapter
  suites away from direct `WarpRuntime` imports and `WarpRuntime.open(...)`
- renamed the remaining runtime-named core tests to `WarpCore.*`
- replaced the old runtime prototype snapshot with a structural
  [WarpCore API surface test](../../../../test/unit/domain/WarpCore.apiSurface.test.ts)
- widened [RuntimeHostProduct.ts](../../../../src/domain/warp/RuntimeHostProduct.ts)
  to honestly type the host internals still exercised by white-box legacy
  suites
- advanced the runtime-kill chain so the next remaining blocker is
  `DX_migrate-tests-and-seed-helpers-off-warpruntime`

## Why it mattered

The final class delete is no longer coupled to a broad test-suite migration.
The remaining test/helper card is now a closeout gate over ratchets that already
exist, which keeps `API_delete-warpruntime-class` focused on source/export
removal.

## Witness

- `npm exec vitest run test/unit/domain/runtimeProductExecutableSurface.test.ts test/unit/domain/publicReadApiExecutablePaths.test.ts test/unit/domain/publicStrandAndRuntimeSeams.test.ts`
- `npm exec vitest run $(git diff --name-only --diff-filter=ACM | rg '^test/.*\.test\.ts$' | rg -v 'WarpGraph\.(serve|syncAuth|syncWith)\.test\.ts')`
- `npm exec vitest run test/unit/domain/WarpGraph.serve.test.ts test/unit/domain/WarpGraph.syncAuth.test.ts test/unit/domain/WarpGraph.syncWith.test.ts`
- `npm run typecheck`
- `git diff --check`

The sync/serve suites require local `127.0.0.1` listeners; the sandboxed run
failed with `listen EPERM`, and the elevated run passed.
