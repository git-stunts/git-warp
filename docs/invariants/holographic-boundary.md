# Holographic Boundary

## What must remain true?

The initial state plus the ordered sequence of per-writer patch chains
is sufficient to reconstruct the full materialized graph. No ambient
state, side channel, or implicit context is required.

## Why does it matter?

Paper III, Theorem 4.1 (Computational holography) proves that the
boundary encoding `(U_0, P)` uniquely determines the interior
derivation volume. In git-warp, the boundary encoding is: the empty
initial state (the well-known empty tree) plus all patch commits
reachable from writer refs. If materialization ever depends on
something not captured in the patch chain -- wall-clock time,
environment variables, hostname, random values, Git config -- then
replay diverges, sync breaks, and audit becomes impossible. Two
implementations agreeing on `Apply` and the patch format can replay
each other's histories from boundary artifacts alone.

## Paper grounding

- **Paper III, Theorem 4.1** (Computational holography): `Replay(B)`
  is uniquely determined by `B = (U_0, P)`.
- **Paper III, Remark 3.4** (Anti-tautology): the boundary is only
  information-complete when patches are designed to be sufficient and
  stable under replay; they must eliminate ambiguity.
- **Paper III, Remark 3.3** (Patch sufficiency checklist): patches
  must fix rule-pack identifiers, accepted match keys, attachment
  deltas, and commit flags.

## How the codebase upholds it

- Patches are CBOR-encoded and stored as Git commit messages pointing
  to the empty tree. The commit SHA is the content address.
- `PatchBuilderV2.commit()` captures all six operation types
  (NodeAdd, NodeTombstone, EdgeAdd, EdgeTombstone, PropSet, BlobValue)
  with full CRDT metadata (dots, observed sets, EventIds).
- `WarpGraph.materialize()` walks all writer refs, decodes every
  patch, and feeds them through `JoinReducer`. No external state is
  consulted.
- The domain layer has no access to `Date.now()`, `Math.random()`, or
  environment variables. Lamport clocks and writer IDs are the only
  time-like values, and both are embedded in patches.

## How do you check?

1. **Replay test**: Materialize a graph. Clone the Git repo. Materialize
   in the clone. Assert identical state. This is covered by integration
   tests in `test/integration/`.

2. **Domain purity audit**:
   ```bash
   grep -r "Date.now\|Math.random\|process.env" src/domain/ --include="*.js"
   ```
   Must return zero hits.

3. **ESLint gate**: The `no-restricted-globals` rule bans `Buffer` in
   domain code. The pre-commit hook runs ESLint on staged files.

4. **CI gate**: Multi-runtime test matrix (Node, Bun, Deno) exercises
   materialization across runtimes. If materialization depended on
   Node-specific ambient state, Bun/Deno tests would fail.
