# Payload Monoid

## What must remain true?

Provenance payloads compose by concatenation. A checkpoint at state
`U_k` plus the remaining patches `(mu_k, ..., mu_{n-1})` must produce
the same materialized state as replaying all patches
`(mu_0, ..., mu_{n-1})` from the initial empty state.

## Why does it matter?

Paper III, Proposition 3.2 establishes the payload monoid
`(Payload, ., epsilon)`: composition is concatenation, identity is the
empty sequence. This algebraic structure is what makes checkpoints,
wormholes, and incremental materialization sound. If
`materialize(checkpoint + remaining_patches)` ever diverges from
`materialize(all_patches)`, then checkpoints become unsound,
incremental sync breaks, and fast recovery from checkpoints produces
wrong state.

## Paper grounding

- **Paper III, Proposition 3.2** (Payload monoid): `(Payload, ., epsilon)`
  is a monoid under concatenation.
- **Paper III, Remark 3.5** (Worldline algebra): if `(U_0, P)` replays
  to `U_k` and `(U_k, Q)` replays to `U_n`, then `(U_0, P . Q)` replays
  to `U_n`.
- **Paper III, Section 6** (Wormholes): wormhole composition is
  payload concatenation, which is associative by the monoid law.

## How the codebase upholds it

- `CheckpointService` snapshots the full `WarpState` (OR-Sets,
  property map, version vector) at a known frontier.
- `WarpGraph.materialize()` can start from a checkpoint and apply only
  patches beyond the checkpoint's frontier, using `VersionVector`
  comparison to skip already-incorporated patches.
- The version vector in the checkpoint records which patches have been
  incorporated. Patches with Lamport timestamps at or below the
  checkpoint frontier are skipped; those above are applied.

## How do you check?

1. **Checkpoint equivalence test**: Create a graph with multiple
   writers and many patches. Materialize from scratch. Create a
   checkpoint at some midpoint. Materialize from the checkpoint plus
   remaining patches. Assert state equality. Covered by checkpoint
   tests in `test/unit/domain/services/`.

2. **Incremental materialization test**: Apply patches incrementally
   (one at a time, materializing after each). Assert final state
   matches bulk materialization. Covered by `JoinReducer` tests.

3. **Associativity witness**: For patches P, Q, R from different
   writers, verify that `materialize(P . (Q . R))` equals
   `materialize((P . Q) . R)`. This is a consequence of CRDT
   commutativity and is exercised by the noCoordination suite.
