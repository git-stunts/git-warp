---
id: PROTO_legacy-props-as-projection
blocked_by:
  - PROTO_attachment-plane-substrate
blocks:
  - TRUST_genesis-replay-equivalence
feature: graph-model-substrate
---

# Legacy props as projection

## Why

Consumer code may still want "node props" and "edge props" as a
convenience view. That can survive, but only as a read-side projection
over the attachment plane.

## Done looks like

- property-bag reads are projection helpers, not substrate truth
- graph writes no longer depend on prop-bag semantics
- read surfaces document clearly which property views are compatibility
  projections and which are substrate facts

## Starting points

- `src/domain/services/controllers/QueryReads.ts`
- `src/domain/capabilities/QueryCapability.ts`
