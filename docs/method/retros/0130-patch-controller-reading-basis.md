# 0130 Patch Controller Reading Basis Retro

- Date: 2026-05-04
- Cycle: [0130-patch-controller-reading-basis](../../design/0130-patch-controller-reading-basis.md)
- Source task: `PORT_patch-controller-reading-basis`

## What Happened

Patch creation still had a hidden freshness path that could call the
runtime materialization seam when a parent existed but cached state was
missing or dirty. That kept materialization alive in the patch controller
even though v17's public read contract is readings/worldlines/observers,
not "materialize first."

This cycle removed `_materializeGraph()` from the `PatchHost` contract.
Additive patch creation can proceed without a cached state, while
state-dependent freshness checks now fail closed until a clean reading
basis exists.

## What Got Better

- `PatchController` no longer names `_materializeGraph()`.
- Additive patches no longer force replay just because a parent exists.
- Missing cached state rejects with `E_NO_STATE`.
- Dirty cached state rejects with `E_STALE_STATE`.
- The release DAG now opens subscription-controller cleanup.

## What Still Smells

- Subscription/watch still carry materialize-spy expectations.
- Sync still has its own read-basis seam.
- Global `WarpGraph.lazyMaterialize` and adjacency-cache tests still
  assert stale private refresh behavior.

## Next

The smallest DAG pull remains `PORT_subscription-controller-reading-basis`,
unless release hygiene demands closing a simpler open node first.
