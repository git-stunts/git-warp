# 0062 Worldline Detached Factory Seam

- Outcome: `hill met`
- Cycle doc: [docs/design/0062-worldline-detached-factory-seam.md](/Users/james/git/git-stunts/git-warp/docs/design/0062-worldline-detached-factory-seam.md)

## What changed

- `Worldline.ts` now depends on `DetachedGraphFactory` instead of a local
  `WarpRuntime.open(...)` path
- the runtime observer cast corridor is gone
- `Worldline.ts` graduated out of both the cast and boundary quarantine
  manifests
- the live detached-graph sludge card was deleted

## Why it mattered

This was the second half of the detached-read cleanup. Once both
`QueryController` and `Worldline` used the same seam, the duplication note
stopped being a future task and became stale residue.

## Witness

- `npm exec vitest run test/unit/scripts/worldline-detached-factory-seam.test.ts test/unit/domain/WarpGraph.worldline.test.ts test/unit/domain/services/controllers/QueryController.test.ts`
- `npm run typecheck`
- `git diff --check`
