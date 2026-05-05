# 0086 Close Capability Interfaces

- Outcome: `hill met`
- Cycle doc: [docs/design/0086-close-capability-interfaces.md](../../../design/0086-close-capability-interfaces.md)

## What changed

- removed the stale `API_capability-interfaces` backlog card
- removed its downstream blocker edges
- preserved the shipped milestone in the v17 release ledger
- refreshed backlog/workload counts

## Witness

- `npx vitest run test/unit/scripts/capability-interfaces-closeout.test.ts`
- `git diff --check`
