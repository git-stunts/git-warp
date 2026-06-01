---
id: OWN_checkpoint-controller-mixed-concerns
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# CheckpointController mixes checkpoint, GC, and migration

**Effort:** M

`CheckpointController.js` (~430 LOC) handles checkpoint creation,
coverage syncing, checkpoint loading, migration validation, GC
execution, and GC metrics. That is 3-4 distinct responsibilities.

## What's wrong

- **S violation**: Checkpoint lifecycle, garbage collection, and
  migration validation are independent concerns.
- GC has its own policy, timing, and metrics — not a subset of
  checkpointing.

## Suggested fix

- Extract `GCController` for GC execution + metrics.
- Extract migration validation to a standalone service or guard.
- `CheckpointController` owns only create/load/coverage.
