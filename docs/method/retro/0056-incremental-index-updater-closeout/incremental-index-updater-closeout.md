# Retro — 0056 IncrementalIndexUpdater Closeout

## Outcome

`hill met`

The repo no longer carries `GOD_incremental-index-updater` as live `v17` work.

That is honest because the god split already landed:

- `IncrementalIndexUpdater.ts` is 495 LOC
- `IndexNodeUpdater.ts` exists
- `IndexEdgeUpdater.ts` exists
- `ShardPort.ts` exists

The real remaining work is boundary/model cleanup, and the release ledger now
points to the notes that already own that residue.

## What changed

- removed the stale live god card
- removed the dead workload entry from `WL-37`
- updated the `v17` release ledger to explain the closeout and residue owners
- removed fake downstream blockers from:
  - `API_migrate-consumers-to-capabilities`
  - `GOD_remaining-big-files`
  - `CROSS_shared-provider-interfaces`
- corrected the historical wave and scorecard surfaces so they stop teaching
  the obsolete 955-LOC story
- added a docs ratchet at
  `test/unit/scripts/incremental-index-updater-closeout-shape.test.ts`

## Why this is better

It kills another fake blocker without losing the real debt.

The repo no longer mixes:

- god-slaying already completed
- boundary/model cleanup still outstanding

Those are now separate truths again.

## Next

The next honest `v17` work is the remaining live trunks this unblock leaves
behind:

- `GOD_remaining-big-files`
- `API_migrate-consumers-to-capabilities`
- `API_kill-warpruntime`
