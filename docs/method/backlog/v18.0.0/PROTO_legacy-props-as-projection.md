---
id: PROTO_legacy-props-as-projection
status: complete
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

- [x] property-bag reads are projection helpers, not substrate truth
- [x] graph writes no longer depend on prop-bag semantics
- [x] read surfaces document clearly which property views are compatibility
  projections and which are substrate facts

## Starting points

- `src/domain/services/controllers/QueryReads.ts`
- `src/domain/capabilities/QueryCapability.ts`

## Closeout Evidence

Completed by v18 slices 27 through 35:

- `LegacyNodePropertyKey`, `LegacyEdgePropertyKey`, `LegacyPropertyValue`,
  `VisibleNodePropertyRecord`, `VisibleEdgePropertyRecord`, and
  `LegacyPropertyProjection` name the compatibility view.
- `NodePropertyProjection` and `EdgePropertyProjection` project visible
  `WarpState` property facts without treating raw keys as substrate truth.
- `QueryReads`, `StateReaderContext`, `StateQueryReadModel`, and
  `TranslationCost` now consume projection records for public property views
  and property-key accounting.
- `NodePropertyWriteIntent` and `EdgePropertyWriteIntent` move generic
  property writes through runtime-backed intent nouns before compatibility
  lowering.
- `GraphOpAlgebraProjection` emits typed content and property operation nouns
  rather than raw property-map entries.

## Remaining Raw Boundaries

The source audit still finds raw `state.prop` access in named compatibility
and migration-source boundaries:

- reducer and op-strategy mutation paths;
- checkpoint and state serialization;
- state diffing, visible-state scoping, and logical-index build;
- content attachment projection over `_content*` compatibility keys;
- temporal replay snapshots that still accept pre-codec inline fixture values.

Those are intentionally left for the graph-model migration batch. This backlog
item is closed for public property views and graph-op algebra, not for removal
of legacy property storage.
