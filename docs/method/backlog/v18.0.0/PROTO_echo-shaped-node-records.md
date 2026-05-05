---
id: PROTO_echo-shaped-node-records
blocked_by: []
blocks:
  - PROTO_attachment-plane-substrate
  - PROTO_graph-op-algebra-convergence
  - INFRA_graph-model-migration-tool
feature: graph-model-substrate
---

# Echo-shaped node records

## Why

`git-warp` still treats node identity as a bare string plus property
bag fallout. Echo's substrate treats nodes as skeleton records with
stable identity and explicit type.

If the repos are going to share the same graph model, node records
must stop being implied by property traffic.

## Done looks like

- `NodeId` and `TypeId` are runtime-backed substrate concepts
- node existence is represented as a node record, not a side effect of
  `NodeAdd` plus prop reconstruction
- the reducer state and read surfaces can talk about node records
  directly
- the migration path from legacy string node ids is deterministic and
  documented

## Starting points

- `src/domain/types/ops/NodeAdd.ts`
- `src/domain/services/state/WarpState.ts`
- `src/domain/services/controllers/QueryReads.ts`
