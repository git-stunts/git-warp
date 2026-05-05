# 0059 Retro — Capability Bag Public Sync

## Outcome

`hill met`

The public `openWarpGraph()` seam is now honest enough to begin the broader
consumer migration:

- no `_runtime` leak on `WarpGraph`
- no `as unknown as` capability wiring in `openWarpGraph()`
- direct peer sync works through the public capability bag

## What changed

- replaced cast-cosplay in [WarpGraph.ts](../../../../src/domain/WarpGraph.ts)
  with runtime-checked, frozen capability binding
- removed `_runtime` from the public `WarpGraph` type and value
- introduced a public sync-remote shape in
  [SyncCapability.ts](../../../../src/domain/capabilities/SyncCapability.ts)
  so direct peer sync can accept a capability bag instead of `WarpRuntime`
- taught sync target resolution in
  [syncHelpers.ts](../../../../src/domain/services/controllers/syncHelpers.ts)
  and [SyncController.ts](../../../../src/domain/services/controllers/SyncController.ts)
  to accept either a direct processor or a `WarpGraph`-style peer
- updated the public consumer type surface and API reference so they stop
  teaching `graphB._runtime`
- updated the live backlog note and `v17` release ledger to mark the public
  tranche as shipped while keeping the broader internal migration note alive

## Evidence

- `npm exec vitest run test/unit/domain/WarpGraph.public-sync.test.ts test/unit/scripts/warpgraph-capability-seam.test.ts test/unit/domain/WarpGraph.syncMaterialize.test.ts test/unit/domain/WarpGraph.syncAuth.test.ts test/unit/scripts/public-api-facade-split.test.ts`
- `npm run typecheck`
- `git diff --check`

## What we learned

- the first real capability migration win was not "replace every
  `WarpRuntime` import." It was "stop teaching the public API to reach around
  the capability bag."
- sync peer typing was the critical hinge. Once direct peers stopped requiring
  `WarpRuntime`, removing `_runtime` from `WarpGraph` became a normal API cut
  instead of a breaking panic move.
- `_wiredMethods.d.ts` was still lying about the sync payload/result surface.
  Fixing the public seam flushed out that declaration drift immediately.

## Next

The remaining `API_migrate-consumers-to-capabilities` work is internal:

1. `Observer` / `LogicalTraversal` runtime coupling
2. `QueryController` and detached graph runtime coupling
3. `WarpApp` / `WarpCore` bridge residue
4. then `API_kill-warpruntime`
