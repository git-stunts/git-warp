# 0079 Resplit WarpRuntime Test/Helper Migration

- Outcome: `hill met`
- Cycle doc: [docs/design/0079-resplit-warpruntime-test-helper-migration.md](../../../design/0079-resplit-warpruntime-test-helper-migration.md)

## What changed

- rewrote DX_migrate-tests-and-seed-helpers-off-warpruntime.md
  as the closeout gate over two real successor cuts
- added the explicit successor notes:
  - DX_migrate-seed-and-runtime-helpers-off-warpruntime.md
  - DX_migrate-runtime-suites-off-warpruntime.md
- updated the runtime-kill ledgers so the remaining order is now:
  `DX_migrate-seed-and-runtime-helpers-off-warpruntime` →
  `DX_migrate-runtime-suites-off-warpruntime` →
  `DX_migrate-tests-and-seed-helpers-off-warpruntime` →
  `API_delete-warpruntime-class` →
  `API_kill-warpruntime`
- added and updated the ratchets:
  - [migrate-warpruntime-test-helper-split.test.ts](../../../../test/unit/scripts/migrate-warpruntime-test-helper-split.test.ts)
  - [openwarpgraph-composition-root.test.ts](../../../../test/unit/scripts/openwarpgraph-composition-root.test.ts)
  - [WarpGraph.public-sync.test.ts](../../../../test/unit/domain/WarpGraph.public-sync.test.ts)
  - [kill-warpruntime-split.test.ts](../../../../test/unit/scripts/kill-warpruntime-split.test.ts)

## Why it mattered

This keeps the final runtime delete honest. The repo now admits that helper and
seed infrastructure is a different cut from the broad runtime-facing suite
migration, so the class delete path is executable again instead of hiding
another giant test-surface bomb inside one blocker note.

## Witness

- `npm exec vitest run test/unit/scripts/migrate-warpruntime-test-helper-split.test.ts test/unit/scripts/openwarpgraph-composition-root.test.ts test/unit/domain/WarpGraph.public-sync.test.ts test/unit/scripts/kill-warpruntime-split.test.ts`
- `git diff --check`
