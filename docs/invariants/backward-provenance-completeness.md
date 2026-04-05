# Backward Provenance Completeness

## What must remain true?

Every value in the materialized state traces back to exactly one
producing patch. No value appears without a causal origin, and no
value has ambiguous provenance.

## Why does it matter?

Paper III, Theorem 4.2 proves backward provenance completeness: if
each tick patch produces a disjoint set of new values, then every
produced value has a unique producer. This is the foundation of
slicing (materializing only the causal cone for a target value) and
audit (tracing any current state back to the patch that created it).
If two patches could both claim to produce the same value, the
provenance graph would contain ambiguous paths, making `patchesFor()`
unreliable, `materializeSlice()` unsound, and audit verification
meaningless.

## Paper grounding

- **Paper III, Definition 4.4** (Backward provenance completeness):
  every value `w` not in the initial state has exactly one producing
  patch index `i` with `w in Out(mu_i)`.
- **Paper III, Theorem 4.2**: under disjoint output sets, backward
  provenance completeness holds.
- **Paper III, Theorem 5.1** (Slicing): backward provenance
  completeness is a precondition for correct partial materialization.

## How the codebase upholds it

- Each node/edge addition carries a unique `Dot` (writerId, counter
  pair). The Dot is the value's identity in the OR-Set. No two
  patches produce the same Dot because each writer maintains a
  monotonically increasing Lamport counter.
- Properties use `EventId` (writerId + Lamport timestamp) for LWW
  ordering. Each property-set operation is uniquely identified.
- `ProvenancePayload` in `src/domain/services/provenance/` tracks
  patch-to-value mappings.
- `patchesFor()` on WarpGraph returns the causal chain for a specific
  node or edge.

## How do you check?

1. **Dot uniqueness test**: In any test creating multiple patches from
   multiple writers, collect all Dots emitted across all patches.
   Assert no duplicates. The unit tests for `VersionVector` and
   `ORSet` exercise this.

2. **Provenance round-trip**: Materialize a graph, pick a node, call
   `patchesFor(nodeId)`, replay only those patches, and verify the
   node appears with the correct properties. Covered by provenance
   tests.

3. **Static check**: Writer IDs must be unique per writer. The
   `WriterId` utility in `src/domain/utils/WriterId.js` generates
   cryptographically random IDs, making collision probability
   negligible.
