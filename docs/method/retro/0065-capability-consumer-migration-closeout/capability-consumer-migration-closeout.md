# 0065 Capability Consumer Migration Closeout

- Outcome: `hill met`
- Cycle doc: [docs/design/0065-capability-consumer-migration-closeout.md](/Users/james/git/git-stunts/git-warp/docs/design/0065-capability-consumer-migration-closeout.md)

## What changed

- `API_migrate-consumers-to-capabilities` now records the completed consumer
  tranches as materially satisfied
- `API_kill-warpruntime` is no longer blocked on that migration note
- the `v17` release ledger now points the remaining runtime work at the
  composition root and runtime residue directly

## Why it mattered

This removes a stale blocker lie and makes the next runtime trunk explicit. We
are no longer pretending the remaining problem is facade migration when the
real remaining work is deleting the runtime bridge itself.

## Witness

- `npm exec vitest run test/unit/scripts/capability-consumer-migration-closeout.test.ts`
- `git diff --check`
