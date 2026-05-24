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
- the next slice now inserts a v17 golden graph-history fixture corpus before
  real source inventory collection, so migration work proves against restored
  Git objects and refs instead of compact in-memory proof cases alone.

Remaining migration-tool work is intentionally ordered as:

- slice 46: create v17 golden graph-history fixtures and restore checks
  (complete);
- slice 47: collect real source inventory from restored history (complete);
- slice 48: lower dry-run planned operations (complete);
- slice 49: write scratch migrated history (complete);
- slice 50: gate scratch output with genesis equivalence (complete);
- slice 51: design finalization safety (complete);
- slice 52: implement archive-preserving finalization (complete);
- slice 53: wire the end-to-end migration command (complete);
- slice 54: prove post-migration runtime conformance (conformance evidence
  gate complete; real runtime replay provider still release-critical);
- slice 55: close the content/property migration audit (complete).
- slice 56: construct legacy fixture genesis readings (complete);
- slice 57: construct scratch operation genesis readings (complete);
- slice 58: add command reading providers (complete).
- slice 59: add a scratch runtime conformance provider (operation-history
  readback complete; production runtime replay still release-critical).
- slice 60: prove command finalization with command-owned readings and scratch
  runtime conformance (complete).
- slice 61: prove provider-built scratch readings still block finalization on
  divergence (complete).
- slice 62: add deterministic operator report output for migration command
  evidence (complete).
- slice 63: add a non-finalizing migration command CLI wrapper that writes
  scratch history and refuses live-ref finalization flags (complete).
- slice 64: record v18 public release blockers before widening release claims
  (complete).
- slice 65: replan with command-CLI evidence in hand and set the next
  production-runtime replay goalpost (complete).

## Starting points

- `scripts/migrations/`
- `fixtures/v17/`
- `src/domain/services/JoinReducer.ts`
- `src/infrastructure/adapters/CborPatchJournalAdapter.ts`
