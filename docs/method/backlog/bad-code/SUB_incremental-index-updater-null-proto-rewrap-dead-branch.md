---
id: SUB_incremental-index-updater-null-proto-rewrap-dead-branch
blocked_by: []
blocks: []
---

# PROTO_incremental-index-updater-null-proto-rewrap-dead-branch

## What stinks

`src/domain/services/index/IncrementalIndexUpdater.js` still has one uncovered branch in `_handleProps()`:

- lines 588-590 re-wrap `nodeProps` with `mergeIntoNullProto(...)` when `Object.getPrototypeOf(nodeProps) !== null`

But the updater already normalizes loaded property bags into null-prototype objects before they reach this update path, and fresh bags created in the same method are also null-prototype objects.

## Why it matters

- Coverage time gets wasted chasing a branch that appears structurally unreachable under honest inputs.
- The extra re-wrap suggests uncertainty about the updater's internal invariants.
- It obscures the real contract: property bags in this subsystem are supposed to be null-prototype maps.

## Suggested direction

- Remove the dead branch if the invariant is real, or
- move the normalization to a single trusted boundary and assert it explicitly so the contract is obvious.

## Evidence

- After the cycle 0010 indexer tranche, `IncrementalIndexUpdater.js` was reduced to exactly these three uncovered lines while live edge, node, label, shard, and cache reconciliation paths were covered.
