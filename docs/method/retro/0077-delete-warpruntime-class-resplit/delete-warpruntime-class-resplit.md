# 0077 Resplit WarpRuntime Class Delete

- Outcome: `hill met`
- Cycle doc: [docs/design/0077-delete-warpruntime-class-resplit.md](/Users/james/git/git-stunts/git-warp/docs/design/0077-delete-warpruntime-class-resplit.md)

## What changed

- rewrote [API_delete-warpruntime-class.md](/Users/james/git/git-stunts/git-warp/docs/method/backlog/v17.0.0/API_delete-warpruntime-class.md)
  as the umbrella over the real remaining pre-delete cuts
- added the two explicit successor notes:
  - [PORT_extract-runtime-host-product.md](/Users/james/git/git-stunts/git-warp/docs/method/backlog/v17.0.0/PORT_extract-runtime-host-product.md)
  - [DX_migrate-tests-and-seed-helpers-off-warpruntime.md](/Users/james/git/git-stunts/git-warp/docs/method/backlog/v17.0.0/DX_migrate-tests-and-seed-helpers-off-warpruntime.md)
- added the split ratchet at
  [delete-warpruntime-class-split.test.ts](/Users/james/git/git-stunts/git-warp/test/unit/scripts/delete-warpruntime-class-split.test.ts)
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

- `npm exec vitest run test/unit/scripts/delete-warpruntime-class-split.test.ts test/unit/scripts/kill-warpruntime-split.test.ts`
- `git diff --check`
