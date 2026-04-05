# Writer Isolation

## What must remain true?

Each writer owns exactly one Git ref
(`refs/warp/<graph>/writers/<writerId>`) and appends only to its own
patch chain. No writer modifies another writer's ref. Writers require
no coordination to produce valid patches.

## Why does it matter?

Paper II defines the scheduler as a total function of state
(Definition 4.5), and the two-plane commutation theorem (Theorem 7.1)
proves that attachment updates commute with skeleton publication under
no-delete/no-clone invariants. In the distributed case, OG-4's
Network Tick Confluence (Theorem 10) proves convergence only when
each writer's suffix is independent of other writers' suffixes.

Writer isolation is the mechanism that makes independence structural
rather than probabilistic. If writer A could modify writer B's ref,
then B's Lamport clock and version vector would become inconsistent
with B's actual patch chain. The CRDT merge in JoinReducer assumes
each dot is produced by exactly one writer; violating writer isolation
breaks backward provenance completeness (Paper III, Theorem 4.2).

## Paper grounding

- **Paper II, Theorem 7.1** (Two-plane commutation): attachment
  updates commute with skeleton publication under no-delete/no-clone-
  under-descent.
- **Paper II, Definition 6.1** (Left-most scheduler): deterministic
  batch selection is per-state, not per-writer.
- **OG-4, Theorem 10** (Network Tick Confluence): independent suffixes
  from different replicas converge.
- **OG-4, Definition 8** (Suffix Transport): transport is defined
  only when patches are independent.

## How the codebase upholds it

- `Writer` class in `src/domain/warp/Writer.js` is constructed with
  a specific `writerId` and writes only to that writer's ref.
- `PatchSession` in `src/domain/warp/PatchSession.js` scopes all
  operations to a single writer.
- `GitGraphAdapter.updateRef()` uses compare-and-swap (CAS) to
  advance a specific writer's ref. It does not touch other writers'
  refs.
- `SyncProtocol` imports patches from remote writers into their
  respective local refs without modifying the local writer's chain.

## How do you check?

1. **Ref layout test**: After multi-writer operations, verify that
   each writer's ref points to a commit chain containing only that
   writer's patches:
   ```bash
   git warp history --writer <writerId>
   ```
   Each patch in the output must have the expected writer ID.

2. **Static analysis**: `Writer.js` and `PatchSession.js` must never
   accept a `writerId` parameter that differs from the one set at
   construction:
   ```bash
   grep -n "writerId" src/domain/warp/Writer.js src/domain/warp/PatchSession.js
   ```

3. **Integration test**: The multi-writer integration tests in
   `test/integration/` create multiple writers that operate
   concurrently. After sync, verify that each writer's ref chain
   contains only that writer's commits.

4. **noCoordination suite**: The regression suite in
   `test/unit/domain/WarpGraph.noCoordination.test.js` exercises
   writers that never coordinate, proving isolation is sufficient
   for correctness.
