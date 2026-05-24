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

## Progress

V18 slices 36 through 45 completed the non-destructive foundation:

- migration manifest, source inventory, dry-run planner, ordered history
  input, and manifest JSON adapter exist;
- a dry-run CLI exists under `scripts/v18.0.0/migrations/graph-model/`;
- request JSON is decoded through
  `GraphModelMigrationDryRunRequestJsonAdapter`;
- the CLI writes only optional manifest artifacts and refuses apply/write
  verbs;
- genesis proof and divergence nouns exist for later migration gates.

Remaining migration-tool work is intentionally ordered as:

- slice 46: collect real source inventory;
- slice 47: lower dry-run planned operations;
- slice 48: write scratch migrated history;
- slice 49: gate scratch output with genesis equivalence;
- slice 50: design finalization safety.

## Starting points

- `scripts/migrations/`
- `src/domain/services/JoinReducer.ts`
- `src/infrastructure/adapters/CborPatchJournalAdapter.ts`
