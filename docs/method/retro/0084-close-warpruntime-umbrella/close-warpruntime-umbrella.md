# 0084 Close WarpRuntime Umbrella

- Outcome: `hill met`
- Cycle doc: [docs/design/0084-close-warpruntime-umbrella.md](../../../design/0084-close-warpruntime-umbrella.md)

## What changed

- removed the completed `API_kill-warpruntime` backlog card
- removed `API_kill-warpruntime` from `TS_publish-pipeline.blocked_by`
- removed stale predecessor `blocks` edges that pointed at the umbrella
- marked the runtime-kill chain closed in the v17 release ledger
- refreshed backlog/workload counts

## Why it mattered

The runtime-kill line is no longer a live blocker. Future v17 work can treat
the old `WarpRuntime` class/file/opener as deleted fact and move on to publish,
capability, and cleanup work without dragging an umbrella dependency along.

## Witness

- `npx vitest run test/unit/scripts/kill-warpruntime-split.test.ts test/unit/scripts/delete-warpruntime-class-split.test.ts test/unit/scripts/migrate-warpruntime-test-helper-split.test.ts test/unit/scripts/capability-consumer-migration-closeout.test.ts`
- `npm run typecheck`
- `git diff --check`
