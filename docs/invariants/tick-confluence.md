# Tick Confluence

## What must remain true?

Given the same set of patches from all writers, materialization must
produce the same state regardless of the order in which those patches
are applied.

## Why does it matter?

This is the foundational determinism guarantee of the entire system.
Paper II, Theorem 5.1 (Skeleton-plane tick confluence) proves that any
two serializations of a scheduler-admissible batch yield isomorphic
successor states. In the codebase, this manifests as: two replicas
receiving the same patches in different orders must converge to
identical materialized state. If this breaks, multi-writer graphs
produce different results depending on network timing, making the
database non-deterministic and all downstream queries unreliable.

## Paper grounding

- **Paper II, Theorem 5.1** (Skeleton-plane tick confluence): any two
  serializations of pairwise-independent matches yield isomorphic
  successors.
- **Paper II, Corollary 5.2** (Within-tick worldline uniqueness): the
  tick outcome is unique up to isomorphism.
- **OG-4, Theorem 10** (Network Tick Confluence): extends local
  confluence to the distributed case -- replicas importing each
  other's independent suffixes converge to isomorphic final states.

## How the codebase upholds it

- `JoinReducer` applies patches using OR-Set (add-wins) for
  nodes/edges and LWW (Lamport timestamp, then writer ID, then patch
  SHA) for properties. These CRDTs are commutative, associative, and
  idempotent by construction.
- `WarpGraph.materialize()` replays all patches from all writers
  through `JoinReducer`, producing the same `WarpState` regardless
  of patch arrival order.
- The `test/unit/domain/WarpGraph.noCoordination.test.js` regression
  suite is the primary witness: it exercises concurrent multi-writer
  scenarios where writers never coordinate, verifying that
  materialization converges.

## How do you check?

1. **Test suite (primary)**:
   ```bash
   npx vitest run test/unit/domain/WarpGraph.noCoordination.test.js
   ```
   This file is non-negotiable. It must pass before any PR merges.

2. **Property check**: For any test that creates patches from multiple
   writers, materialize twice with patches applied in reversed order.
   Assert state equality. The noCoordination suite does this.

3. **CI gate**: The full unit test suite runs on every PR via GitHub
   Actions. The noCoordination tests are included.
