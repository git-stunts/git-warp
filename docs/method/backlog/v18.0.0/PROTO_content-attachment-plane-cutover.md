---
id: PROTO_content-attachment-plane-cutover
blocked_by:
  - PROTO_attachment-plane-substrate
blocks:
  - INFRA_graph-model-migration-tool
  - TRUST_genesis-replay-equivalence
feature: graph-model-substrate
---

# Content attachment-plane cutover

## Why

`_content`, `_content.mime`, and `_content.size` are property
conventions, not honest substrate payload law. Shared graph shape
needs content to live in the same typed attachment plane as every other
payload-bearing graph object.

## Done looks like

- content metadata and content references no longer define themselves
  through property keys
- node and edge content use explicit typed attachment payloads
- the migration path from legacy content props is deterministic and
  verified

## Starting points

- `docs/specs/CONTENT_ATTACHMENT.md`
- `src/domain/types/ops/BlobValue.ts`
- `src/domain/services/controllers/QueryReads.ts`
