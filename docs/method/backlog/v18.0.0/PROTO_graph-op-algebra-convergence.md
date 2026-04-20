---
id: PROTO_graph-op-algebra-convergence
blocked_by:
  - PROTO_echo-shaped-node-records
  - PROTO_echo-shaped-edge-records
  - PROTO_attachment-plane-substrate
blocks:
  - INFRA_graph-model-migration-tool
  - TRUST_genesis-replay-equivalence
---

# Graph-op algebra convergence

## Why

The current persistent op family is still patch-plus-CRDT-property
traffic. Shared graph shape needs a substrate op algebra that speaks
explicit structural edits and attachment edits.

## Done looks like

- persistent graph truth is expressed with explicit node, edge, and
  attachment ops
- `PropSet`, `NodePropSet`, and `EdgePropSet` stop being the graph
  substrate contract
- the new algebra can still travel inside the `git-warp` causal
  envelope if replay honesty holds

## Starting points

- `src/domain/types/Patch.ts`
- `src/domain/services/OpNormalizer.ts`
- `src/domain/services/JoinReducer.ts`
