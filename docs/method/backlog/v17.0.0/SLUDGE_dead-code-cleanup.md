---
id: SLUDGE_dead-code-cleanup
blocks: []
blocked_by: []
status: blocked
feature: runtime-boundaries
---

# Delete dead code from op behavior migration

## Status: BLOCKED

**Original plan was wrong.** These files are NOT dead:

- `OpStrategies.ts` — still imported by `ConflictCandidateCollector.js`
  via `JoinReducer.ts` re-export. Used for conflict analysis dispatch.
- `OpStrategy.ts` — base class for OpStrategies, stays while it stays.
- `OpLike.ts` — still imported by `PatchHydrator.ts` and `OpNormalizer.ts`.
- `SnapshotBeforeOp.ts` (services/) — imported by OpStrategy + OpStrategies.

**True blocker:** `ConflictCandidateCollector` must migrate from
`OP_STRATEGIES.get(opType).outcome()` to using op class methods
directly (e.g., `op.outcome()`). Until then, the strategy registry
and its base class are live code.

**Prereq:** Migrate ConflictCandidateCollector to use op class
dispatch, THEN delete OpStrategies/OpStrategy/OpLike.

## What IS safely deletable now

- `src/domain/services/SnapshotBeforeOp.ts` (old location) — duplicate
  of `src/domain/types/ops/SnapshotBeforeOp.ts`. Only imported by
  OpStrategy.ts and OpStrategies.ts. Can be deleted when those die.
