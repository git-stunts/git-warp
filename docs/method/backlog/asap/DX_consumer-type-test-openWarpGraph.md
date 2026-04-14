# Add openWarpGraph coverage to consumer type surface test

**Audit ref:** SR01-V3

`test/type-check/consumer.ts` exercises `WarpApp`, `WarpCore`, and dozens of
domain types, but does NOT import or exercise `openWarpGraph` or `WarpGraph` —
the new v17 public entry point.

The `.d.ts` surface for the flagship API is not validated by the type-level
smoke test.

## Steps

1. Add to `test/type-check/consumer.ts`:
   ```ts
   import { openWarpGraph, type WarpGraph } from '@git-stunts/git-warp';
   declare const graph: WarpGraph;
   graph.patches;       // PatchCapability
   graph.query;         // QueryCapability
   graph.commitment;    // CommitmentSurface
   graph.folding;       // FoldingSurface
   graph.revelation;    // RevelationSurface
   graph.governance;    // GovernanceSurface
   ```
2. Run `npm run typecheck:consumer` to verify.
