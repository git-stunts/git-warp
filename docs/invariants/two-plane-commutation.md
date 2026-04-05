# Two-Plane Commutation

## What must remain true?

Property updates (the attachment plane) and topology changes (the
skeleton plane) are independent operations that commute. Applying
property changes before or after adding/removing nodes and edges
produces the same materialized state.

## Why does it matter?

Paper II, Theorem 7.1 (Two-plane commutation) proves that attachment-
plane steps commute with skeleton-plane steps up to canonical
transport, provided no-delete/no-clone-under-descent holds. This
means the order in which git-warp processes "add node X" versus
"set property on node Y" within the same materialization pass does
not affect the result.

If this invariant breaks, materialization order within a single
patch or across patches produces different results, violating tick
confluence. The two-plane separation is also the architectural reason
that `JoinReducer` can process operations in a single pass: it does
not need to topologically sort property operations relative to
structural operations.

## Paper grounding

- **Paper II, Theorem 7.1** (Two-plane commutation): attachment
  updates commute with skeleton publication up to canonical transport
  under no-delete/no-clone-under-descent.
- **Paper II, Definition 6.2** (No-delete/no-clone-under-descent):
  skeleton publication cannot destroy or duplicate attachment lineage.
- **Paper II, Corollary 7.2** (Deterministic tick outcome): the tick
  outcome is unique up to isomorphism, independent of serialization
  order and interleaving of attachment/skeleton updates.

## How the codebase upholds it

- `JoinReducer` processes operations in a single pass. NodeAdd/
  NodeTombstone affect `nodeAlive` (OR-Set). EdgeAdd/EdgeTombstone
  affect `edgeAlive` (OR-Set). PropSet affects the `prop` map (LWW).
  These three data structures are independent: mutating one does not
  affect the others.
- `OpNormalizer` canonicalizes raw `PropSet` operations into
  `NodePropSet` and `EdgePropSet`, but this normalization is a
  boundary concern that does not change the commutativity of the
  underlying CRDT operations.
- Properties on deleted nodes are preserved in the prop map even after
  the node is tombstoned. This is the "no-delete-under-descent"
  invariant in practice: removing a node from `nodeAlive` does not
  cascade-delete its properties.

## How do you check?

1. **Interleaving test**: Create patches with mixed structural and
   property operations. Apply them in different orders within
   `JoinReducer`. Assert identical final state. Covered by
   `JoinReducer` unit tests.

2. **Property survival test**: Add a node, set properties on it,
   tombstone it, then re-add it. Verify properties are restored
   correctly. This exercises the independence of the property map
   from the OR-Set.

3. **CRDT independence audit**: The three state components
   (`nodeAlive`, `edgeAlive`, `prop`) in `WarpStateV5` must have no
   cross-references that would create ordering dependencies:
   ```bash
   grep -n "nodeAlive\|edgeAlive" src/domain/services/JoinReducer.js
   ```
   Verify that mutations to one never conditionally depend on another.
