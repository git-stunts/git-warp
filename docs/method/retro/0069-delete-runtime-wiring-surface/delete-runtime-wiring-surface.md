# 0069 Delete Runtime Wiring Surface

- Outcome: `hill met`
- Cycle doc: [docs/design/0069-delete-runtime-wiring-surface.md](/Users/james/git/git-stunts/git-warp/docs/design/0069-delete-runtime-wiring-surface.md)

## What changed

- deleted `src/domain/runtimeWiring.ts`
- deleted `src/domain/warp/_wiredMethods.d.ts`
- moved the formerly wired runtime surface onto
  [WarpRuntime.ts](/Users/james/git/git-stunts/git-warp/src/domain/WarpRuntime.ts)
- retired the `_wiredMethods` signature-drift bad-code note
- updated the `v17` ledger so the deleted blocker and deleted declaration file
  stop appearing as live residue

## Why it mattered

This closes the last fake blocker from the first `WarpRuntime` split. The
runtime surface is now statically visible in one file instead of being patched
onto the prototype and shadow-declared elsewhere.

## Witness

- `npm exec vitest run test/unit/scripts/runtime-wiring-surface-closeout.test.ts test/unit/scripts/public-api-cost-signaling.test.ts test/unit/scripts/public-api-strand-noun.test.ts test/unit/scripts/non-ts-tail-shape.test.ts test/unit/domain/WarpGraph.test.ts test/unit/domain/WarpGraph.coverageGaps.test.ts test/unit/scripts/warpgraph-capability-seam.test.ts test/unit/domain/WarpGraph.public-sync.test.ts`
- `npm run typecheck`
- `git diff --check`
