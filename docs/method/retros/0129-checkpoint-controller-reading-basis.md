# 0129 Checkpoint Controller Reading Basis Retro

- Date: 2026-05-04
- Cycle: [0129-checkpoint-controller-reading-basis](../../design/0129-checkpoint-controller-reading-basis.md)
- Source task: `PORT_checkpoint-controller-reading-basis`

## What Happened

Checkpoint creation still had one old escape hatch: when no exact
snapshot-cache record was available, `CheckpointController` could call
the runtime materialization seam to manufacture state for the checkpoint.
That contradicted the v17 reading contract and made checkpoint tests keep
the old API alive by stubbing `_materializeGraph()`.

This cycle removed that seam from the controller host contract.
Checkpoint creation now accepts only an exact snapshot-cache reading or
a clean cached state reading. If neither exists, it rejects with the same
v17 readings guidance used by other state reads.

## What Got Better

- `CheckpointController` no longer names `_materializeGraph()`.
- Dirty and missing cached-state paths now fail before checkpoint artifact
  creation.
- Snapshot-cache exact-hit and clean-miss behavior remains covered.
- Stale public checkpoint tests now install a clean reading basis instead
  of stubbing private materialization.
- The release DAG no longer treats checkpoint-controller reading basis as
  an incomplete blocker.

## What Still Smells

- Patch and sync controllers still call `_materializeGraph()` when their
  local reading basis is missing or dirty.
- Subscription/watch tests still assert materialization as the freshness
  mechanism.
- Several materialize/checkpoint-count tests still assume legacy schema
  or incremental materialization behavior that no longer matches the
  schema-5 checkpoint boundary.

## Next

Pull `PORT_patch-controller-reading-basis` next. It is open, it unblocks
subscription cleanup, and it removes another release-blocking internal
materialization seam without bundling sync security work into the same
diff.
