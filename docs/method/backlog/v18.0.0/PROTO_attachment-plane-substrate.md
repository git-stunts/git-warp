---
id: PROTO_attachment-plane-substrate
blocked_by:
  - PROTO_echo-shaped-node-records
  - PROTO_echo-shaped-edge-records
blocks:
  - PROTO_graph-op-algebra-convergence
  - PROTO_content-attachment-plane-cutover
  - PROTO_legacy-props-as-projection
  - INFRA_graph-model-migration-tool
---

# Attachment-plane substrate

## Why

The current substrate still centers a shared property map. Echo's
graph model separates skeleton from payload and gives node and edge
payload first-class attachment slots.

Without that split, the repos are not modeling the same graph.

## Done looks like

- substrate state separates skeleton records from attachment slots
- node and edge payload live in explicit attachment storage
- attachment keys and attachment values are versioned and validated
- property-like reads become a projection concern, not substrate truth

## Starting points

- `src/domain/services/state/WarpState.ts`
- `src/domain/services/controllers/QueryReads.ts`
- `docs/specs/CONTENT_ATTACHMENT.md`
