# Suffix Transport Correctness

## What must remain true?

Sync integrates remote patches at the current tip without replaying
from a common frontier. When patches are independent (non-interfering
footprints), tip-application by transport produces the same state as
full replay from the common frontier.

## Why does it matter?

OG-4, Theorem 9 (Tip-Application by Transport) proves that for
independent patches, `Apply(Apply(U_F, S), transport_S(pi_B))` is
isomorphic to `Apply(Apply(U_F, pi_B), S^{up pi_B})`. This means a
replica does not need to "rebase" -- it can apply remote patches
directly at its current tip.

In git-warp, this is the theoretical foundation for sync. When
replica A receives patches from replica B, it does not rewind to a
common ancestor and replay everything. Instead, it appends B's
patches to its knowledge and re-materializes. Because CRDT operations
(OR-Set, LWW) are commutative, the patches are automatically
"transported" across A's local suffix by the commutativity of the
merge function.

If this invariant breaks -- if CRDTs lose commutativity or if some
operation has a hidden ordering dependency -- then sync would require
full replay from genesis on every import, making the system O(P^2)
instead of O(P) for P total patches.

## Paper grounding

- **OG-4, Theorem 9** (Tip-Application by Transport): suffix
  transport preserves state isomorphism for independent patches.
- **OG-4, Theorem 10** (Network Tick Confluence): replicas importing
  each other's independent suffixes converge to isomorphic states.
- **OG-4, Corollary 11** (State-Observer Collapse): state-observer
  distance reaches zero even with different serialization orders.
- **OG-4, Definition 7** (Interference): two patches interfere if
  their delete/use/write/read sets overlap.

## How the codebase upholds it

- OR-Set operations are commutative: `add(dot)` and `remove(observed)`
  produce the same result regardless of order.
- LWW registers are commutative: the winner is determined by the
  total order (Lamport timestamp > writer ID > patch SHA), not by
  application order.
- `SyncProtocol` fetches remote writer refs and their commit chains,
  then materializes the union of all patches. It never replays from
  a common frontier -- it relies on CRDT commutativity.
- `VersionVector` tracks the causal frontier. After sync, the
  materialized version vector is the pointwise max of all writers'
  counters, regardless of import order.

## How do you check?

1. **Sync order independence test**: Create two repos with divergent
   histories. Sync A->B and B->A. Materialize both. Assert identical
   state. Then repeat with reversed sync order. Assert identical
   state again. Covered by sync integration tests.

2. **CRDT commutativity tests**: The OR-Set and LWW unit tests verify
   commutativity directly: `apply(op1, op2)` equals `apply(op2, op1)`
   for all operation pairs.

3. **Incremental materialization test**: Apply patches incrementally
   in multiple orderings. Assert final state is always identical.
   Covered by `JoinReducer` tests and the noCoordination suite.
