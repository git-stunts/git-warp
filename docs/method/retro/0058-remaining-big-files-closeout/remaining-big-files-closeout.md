# 0058 Retro — Remaining Big Files Closeout

## Outcome

`hill met`

The repo no longer teaches `GOD_remaining-big-files` as live `v17` work.
The card was stale: every named file was already below the 500 LOC ceiling, and
the only still-serious `StreamingBitmapIndexBuilder` residue had already been
closed by `0057`.

## What changed

- deleted the stale live note
- updated the `v17` release ledger to explain why the card is closed
- removed the fake blocker from:
  - `API_migrate-consumers-to-capabilities`
  - `CROSS_shared-provider-interfaces`
- updated `WL-37` so the workload graph no longer carries the dead god
- refreshed the historical wave and scorecard surfaces to current repo truth
- updated the older `0056` ratchet so it no longer depended on the deleted note

## Evidence

- `npm exec vitest run test/unit/scripts/remaining-big-files-closeout-shape.test.ts test/unit/scripts/incremental-index-updater-closeout-shape.test.ts`
- `git diff --check`

## What we learned

- a lot of the remaining `v17` tail is now planning-truth cleanup, not
  substrate work
- once the real residue was moved under `0057`, `CORE_streaming-memory-audit`,
  and `PROTO_purge-boundary-leaks`, keeping a separate big-file card alive only
  made the API cutover graph lie
- closeout cycles need to repair older ratchets when those ratchets have
  accidentally turned stale backlog notes into required evidence

## Next

The next honest `v17` move is now on the real open trunks, not on cleanup
ghosts:

1. `API_migrate-consumers-to-capabilities`
2. `INFRA_unify-persistence-on-git-cas`
3. the `0025` purge chain (`PROTO_purge-cast-hacks` → `PROTO_purge-boundary-leaks` → `PROTO_purge-fake-models`)
