---
id: SLUDGE_dead-code-cleanup
blocks: []
blocked_by: []
---

# Delete dead code from op behavior migration

Op behavior now lives on the op classes. These files are dead:

- `src/domain/services/OpStrategies.ts` — strategies dissolved into ops
- `src/domain/services/OpStrategy.ts` — abstract base no longer needed
- `src/domain/services/OpLike.ts` — loose bag type eliminated
- `src/domain/services/SnapshotBeforeOp.ts` — moved to `types/ops/`

Also remove the `OP_STRATEGIES` re-export from `JoinReducer.ts` and
update any consumers still importing from those paths.

## Execution

1. Run `grep -r 'OpStrategies\|OpStrategy\|OpLike\|SnapshotBeforeOp' src/ test/`
   to verify zero remaining imports before deletion.
2. Delete the 4 dead files listed above.
3. Remove the `OP_STRATEGIES` re-export from `JoinReducer.ts`.
4. Re-run the grep to confirm clean removal.
