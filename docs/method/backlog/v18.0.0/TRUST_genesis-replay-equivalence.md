---
id: TRUST_genesis-replay-equivalence
blocked_by:
  - PROTO_graph-op-algebra-convergence
  - PROTO_content-attachment-plane-cutover
  - PROTO_legacy-props-as-projection
  - INFRA_graph-model-migration-tool
blocks: []
feature: graph-model-substrate
---

# Genesis replay equivalence

## Why

The migration is only honest if replaying the migrated history from
genesis yields the same observer-visible graph reading as replaying
the legacy history up to the migration cut.

## Done looks like

- equivalence is checked from genesis, not just at the final snapshot
- node, edge, and payload readings all participate in the proof
- failures tell the operator which patch boundary diverged
- the ship gate for the migration command includes this proof

## Starting points

- `test/`
- `src/domain/services/JoinReducer.ts`
- `docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md`
