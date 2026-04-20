---
id: PROTO_echo-shaped-edge-records
blocked_by: []
blocks:
  - PROTO_attachment-plane-substrate
  - PROTO_graph-op-algebra-convergence
  - INFRA_graph-model-migration-tool
---

# Echo-shaped edge records

## Why

`git-warp` still identifies edges by the `(from, to, label)` triple
and derived key encodings. Echo's substrate gives edges first-class
identity and treats edge type as part of the record, not the identity
carrier.

Shared graph shape requires stable edge records.

## Done looks like

- edges have stable runtime-backed identity
- edge type is distinct from edge identity
- reducer state stops treating the encoded triple key as the substrate
  truth
- the legacy triple-to-record mapping is deterministic and documented

## Starting points

- `src/domain/types/ops/EdgeAdd.ts`
- `src/domain/services/KeyCodec.ts`
- `src/domain/services/state/WarpState.ts`
