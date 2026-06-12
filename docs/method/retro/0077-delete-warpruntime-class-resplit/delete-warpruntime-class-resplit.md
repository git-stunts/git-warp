# 0077 Resplit WarpRuntime Class Delete

- Outcome: `hill met`
- Cycle doc: [docs/design/0077-delete-warpruntime-class-resplit.md](../../../design/0077-delete-warpruntime-class-resplit.md)

## What changed

- rewrote API_delete-warpruntime-class.md
  as the umbrella over the real remaining pre-delete cuts
- added the two explicit successor notes:
  - PORT_extract-runtime-host-product.md
  - DX_migrate-tests-and-seed-helpers-off-warpruntime.md
- added the historical split ratchet
  `test/unit/scripts/delete-warpruntime-class-split.test.ts`; that brittle
  static-text ratchet was retired by the static-text witness burndown and is
  now covered by
  [openwarpgraph-composition-root.test.ts](../../../../test/unit/scripts/openwarpgraph-composition-root.test.ts)
  plus
  [WarpGraph.public-sync.test.ts](../../../../test/unit/domain/WarpGraph.public-sync.test.ts)
- updated the `v17` release ledger and workload map to the new order:
  `PORT_extract-runtime-host-product` →
  `DX_migrate-tests-and-seed-helpers-off-warpruntime` →
  `API_delete-warpruntime-class` →
  `API_kill-warpruntime`

## Why it mattered

This keeps the final runtime delete honest. The remaining work is no longer
"delete the class somehow." It is now one source-side extraction cut, one
test/helper migration cut, then the actual file and export deletion.

## Witness

- `npm exec vitest run test/unit/scripts/openwarpgraph-composition-root.test.ts test/unit/domain/WarpGraph.public-sync.test.ts test/unit/scripts/kill-warpruntime-split.test.ts`
- `git diff --check`
