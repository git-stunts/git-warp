---
id: INFRA_graph-model-migration-tool
blocked_by:
  - PROTO_echo-shaped-node-records
  - PROTO_echo-shaped-edge-records
  - PROTO_attachment-plane-substrate
  - PROTO_graph-op-algebra-convergence
  - PROTO_content-attachment-plane-cutover
blocks:
  - TRUST_genesis-replay-equivalence
feature: graph-model-substrate
---

# Graph-model migration tool

## Why

Backwards compatibility is not the requirement. Honest migration is.
Users need a one-time command that rewrites existing graph history into
the v18 graph model instead of flattening everything into a fake
snapshot.

## Done looks like

- `scripts/v18.0.0/migrations/graph-model` exists
- the tool replays legacy history, emits migrated history, and archives
  the old lineage
- the tool writes a manifest mapping legacy node and edge identity to
  the new substrate ids
- migration fails closed if replay equivalence does not hold

## Starting points

- `scripts/migrations/`
- `src/domain/services/JoinReducer.ts`
- `src/infrastructure/adapters/CborPatchJournalAdapter.ts`
