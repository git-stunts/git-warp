# 0061 Query Controller Capability Seam

- Outcome: `hill met`
- Cycle doc: [docs/design/0061-query-controller-capability-seam.md](/Users/james/git/git-stunts/git-warp/docs/design/0061-query-controller-capability-seam.md)

## What changed

- `QueryController.ts` no longer imports `WarpRuntime`
- observer snapshot resolution now depends on:
  - `DetachedGraphFactory`
  - an injected hash-state callback
- runtime construction wires those seams explicitly instead of relying on
  direct query-controller reach-in

## Why it mattered

This removes the direct runtime lie from the query snapshot path without
pretending the whole detached-graph and bridge tail is solved. The next clean
follow-through is `Worldline`, not another pass over the same query seam.

## Witness

- `npm exec vitest run test/unit/scripts/query-controller-capability-seam.test.ts test/unit/domain/services/controllers/QueryController.test.ts`
- `npm run typecheck`
- `git diff --check`
