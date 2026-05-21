---
id: PROTO_echo-shaped-edge-records
blocked_by: []
blocks:
  - PROTO_attachment-plane-substrate
  - PROTO_graph-op-algebra-convergence
  - INFRA_graph-model-migration-tool
feature: graph-model-substrate
---

# Shared graph-model edge records

Identity note: the backlog id keeps the older `echo-shaped` shorthand for
continuity. The target is graph-model alignment pressure-tested by Echo, not
Echo ownership of `git-warp`.

## Why

`git-warp` still identifies edges by the `(from, to, label)` triple
and derived key encodings. Echo has already pressure-tested edges as
first-class records where edge type is part of the record, not the identity
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
