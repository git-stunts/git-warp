# 0131 Checkpoint Schema Upgrade Path Retro

- Date: 2026-05-04
- Cycle: [0131-checkpoint-schema-upgrade-path](../../design/0131-checkpoint-schema-upgrade-path.md)
- Source task: `SPEC_uniform-git-cas-upgrade-contract-drift`

## What Happened

Runtime checkpoint loading had become honest about accepting only the
current checkpoint envelope, but the promised operator path was still a
stub. That left older graphs with a rejection message and no working way
through the door.

This cycle moved the conversion boundary where it belongs:
`scripts/migrations/v17.0.0/`. The package upgrade command builds the
package, runs the built migration entrypoint, reads retired checkpoint
payloads, writes a current checkpoint, verifies the result through the
normal runtime loader, and only then moves the checkpoint ref.

## What Got Better

- `MigrationService` is gone from shipped runtime source and package-root
  exports.
- Runtime checkpoint helpers expose only current-schema support.
- Retired checkpoint readers live under migration scripts.
- The upgrade helper has behavioral coverage for dry-run, success,
  incomplete payloads, and already-current checkpoints.
- The stale package-upgrade witness now matches the shipped command.

## What Still Smells

- Some historical version-suffixed substrate names remain in `src/`.
  They are larger than this checkpoint upgrade slice and should be paid
  down deliberately.
- `uniform-git-cas-closeout.test.ts` is still a source-text ratchet test;
  it already has a bad-code backlog card.
- The full local test gate remains red because unrelated v17 release DAG
  nodes are incomplete.

## Next

Resume the DAG with `PORT_subscription-controller-reading-basis` or
`PORT_sync-controller-reading-basis`. The migration path no longer blocks
release-gate hygiene work.
