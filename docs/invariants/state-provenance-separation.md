# State-Provenance Separation

## What must remain true?

State convergence does not imply history convergence. Two replicas may
reach identical materialized state while maintaining distinct
provenance DAGs (different patch arrival orders, different writer ref
structures). The system must preserve provenance information
independently of materialized state.

## Why does it matter?

OG-4, Proposition 13 (State Convergence != History Convergence) proves
that replicas can satisfy the Network Tick Confluence Theorem and
reach isomorphic states while maintaining different provenance DAGs.
OG-1, Theorem 91 (State-close, provenance-far observers exist)
formalizes the same insight: boundary observers and bulk observers can
agree on terminal state while remaining separated in provenance space.

In git-warp, this means: even though two repos with the same patches
always produce the same materialized graph (tick confluence), their
Git commit DAGs may differ (different parent chains, different
arrival orders). The system must never conflate "same state" with
"same history." Provenance queries (`patchesFor()`, `history`,
audit verification) must operate on the actual commit DAG, not on
materialized state.

## Paper grounding

- **OG-4, Proposition 13**: replicas can reach isomorphic states while
  maintaining `H_A != H_B`.
- **OG-1, Theorem 91** (State-close, provenance-far): state views can
  be identical while provenance views differ.
- **OG-1, Corollary 94** (Task sufficiency != historical
  faithfulness): perfect accumulated aperture for a state-valued task
  does not imply low structural degeneracy.
- **Paper IV, Example 3.3** (Boundary vs bulk): the boundary observer
  and bulk observer require a translator of non-trivial time cost.

## How the codebase upholds it

- Each writer maintains an independent Git ref
  (`refs/warp/<graph>/writers/<writerId>`). The per-writer commit
  chain is the writer's provenance DAG.
- Materialization reads patches from all writers and produces a single
  merged state, but the individual commit chains remain intact.
- `patchesFor()` and `materializeSlice()` query the commit DAG
  directly, not the materialized state.
- The `history` CLI command walks the commit DAG to show per-writer
  patch history.

## How do you check?

1. **Two-repo test**: Create identical patches in two repos but with
   different arrival orders. Materialize both. Assert state equality.
   Then compare commit DAGs (parent chain structure). Assert they
   differ. This is a consequence of the sync protocol tests.

2. **Provenance independence test**: After materialization, verify that
   `patchesFor(nodeId)` returns the specific commit SHAs that created
   the node, not a derived reconstruction from materialized state.

3. **Audit trail**: `git warp verify-audit` walks the commit DAG and
   verifies tamper-evidence (content hashes). This operates on
   provenance, not materialized state.
