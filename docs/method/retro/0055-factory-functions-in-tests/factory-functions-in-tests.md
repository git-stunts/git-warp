# Retro — 0055 Factory-Functions In Tests

## Outcome

`hill met`

The repo no longer carries `SLUDGE_factory-functions-in-tests` as live `v17`
work.

That is honest because the real constructor-wrapper sludge already died in
`2e99c0cb`. What remains in tests are wire-format transport builders that
exercise decode -> reduce paths and therefore are not the same smell.

## What changed

- removed the stale live backlog card
- removed the dead `WL-35-v17-hygiene-sludge-seed` workload row
- updated the `v17` release ledger so it explains why the card is closed
- repaired the `0054` retro breadcrumb so it no longer points at a dead queue
- added a docs ratchet at
  `test/unit/scripts/factory-functions-in-tests-shape.test.ts`

## Why this is better

It removes another fake `v17` work item without inventing unnecessary test
churn.

The repo now says one consistent thing:

- constructor-wrapper factory sludge is already closed
- the remaining wire-format builders are intentional
- live `v17` work should focus on real runtime and API debt

## Next

Keep burning down actual `v17` trunks instead of stale residue:

- `GOD_incremental-index-updater`
- `API_migrate-consumers-to-capabilities`
- `API_kill-warpruntime`
