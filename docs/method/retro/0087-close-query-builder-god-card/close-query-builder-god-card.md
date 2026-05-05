# 0087 Close Query Builder God Card

- Outcome: `hill met`
- Cycle doc: [docs/design/0087-close-query-builder-god-card.md](../../../design/0087-close-query-builder-god-card.md)

## What changed

- removed the stale `GOD_query-builder` backlog card
- removed it from the v17 workload inventory
- preserved the shipped milestone in the v17 release ledger
- refreshed backlog/workload counts

## Witness

- `npx vitest run test/unit/scripts/query-builder-closeout.test.ts`
- `git diff --check`
