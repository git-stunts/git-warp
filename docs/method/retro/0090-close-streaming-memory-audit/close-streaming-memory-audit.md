# 0090 Close Streaming Memory Audit

- Outcome: `hill met`
- Cycle doc: [docs/design/0090-close-streaming-memory-audit.md](/Users/james/git/git-stunts/git-warp/docs/design/0090-close-streaming-memory-audit.md)

## What changed

- removed the stale `CORE_streaming-memory-audit` v17 backlog card
- preserved the shipped immediate fix by ratcheting
  `GitGraphAdapter.readBlob()` to keep passing unbounded `maxBytes`
- redirected the remaining out-of-core architecture concern to
  `PERF_out-of-core-materialization` and the up-next stream-read chain
- refreshed backlog and workload counts

## Drift check

- `CORE_streaming-memory-audit` was not a complete out-of-core architecture
  slice. Treating it as closed only works because the immediate v17 crash fix
  is already shipped and the broader work remains live elsewhere.
- No new bad-code or cool-ideas notes were needed; this cycle removed stale
  planning residue instead of discovering a new smell.

## Witness

- `npx vitest run test/unit/scripts/streaming-memory-audit-closeout.test.ts test/unit/scripts/remaining-big-files-closeout-shape.test.ts`
- `npm run typecheck`
- `git diff --check`
