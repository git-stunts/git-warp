# 0128 Checkpoint Schema Contract Drift Retro

- Date: 2026-05-04
- Cycle: [0128-checkpoint-schema-contract-drift](../../design/0128-checkpoint-schema-contract-drift.md)
- Source task: `BND_checkpoint-schema-contract-drift`

## What Happened

The checkpoint tests and runtime code were still arguing about whether
schemas `2`, `3`, `4`, or `5` were the shipped v17 checkpoint boundary.
That made every checkpoint-adjacent failure suspicious: a broken test
could be stale legacy shape, and a broken loader could be real release
risk.

This cycle made the boundary explicit. Runtime checkpoint creation and
loading now use schema `5`, schema-5 checkpoints publish a named
envelope tree, and legacy schemas `2`, `3`, and `4` fail closed with
migration guidance.

## What Got Better

- Checkpoint schema constants now have one exported runtime truth.
- Service and edge-case tests exercise schema-5 behavior instead of
  replaying stale `state.cbor` fixtures.
- The checkpoint-tail optic conformance fixture no longer treats schema
  `4` as the index-tree signal; schema `5` is current, and index shards
  are layout data.

## What Still Smells

- `CheckpointController` still reaches for `_materializeGraph()` when it
  lacks a cache-backed reading basis.
- `materializeAt()` remains incompatible with the session-backed runtime
  line in the integration checkpoint test.
- Existing legacy schema stores need explicit migration tooling before
  tools that carry old schema-4 checkpoints can load under v17.

## Next

Pull `PORT_checkpoint-controller-reading-basis` while checkpoint context
is warm, or pull `PORT_patch-controller-reading-basis` if the goal is to
unblock subscription cleanup first.
