---
cycle: 0177
task_id: V18_edge_property_projection
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
release_home: v18.0.0
bearing_task: 29
promotes_backlog:
  - docs/method/backlog/v18.0.0/PROTO_legacy-props-as-projection.md
---

# V18 Edge Property Projection

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Project visible edge properties through named compatibility records while
respecting deterministic edge identity, edge liveness, and endpoint liveness.

## Playback Questions

- Does the projection preserve the current edge identity tuple:
  `from`, `to`, and `type`?
- Are removed edges excluded from visible edge property reads?
- Are properties on edges with non-visible endpoints excluded consistently
  with current query behavior?
- Does the projection preserve current conflict and register semantics?
- Are edge content compatibility keys classified explicitly?

## Existing Shape

Edge property reads repeat legacy decoding logic across query and state reader
surfaces. The direct scans understand edge keys, but they also make it easy to
forget that edge visibility is more than a property-register lookup. Edge
existence and endpoint visibility must stay aligned with the graph's topology
projection.

## Chosen Boundary

Build an edge-property projection over `EdgeRecord` and the property nouns from
slice 27. The projection should use the existing visible edge-record surface
as the topology authority.

For each visible edge, the projection emits immutable edge property records.
Each record owns:

- the stable edge identity;
- the decoded property key;
- the visible value;
- the content-key classification, when applicable;
- enough provenance to preserve current conflict diagnostics if those are
  already exposed.

The projection should not reimplement edge liveness from raw OR-Set internals.
If the edge-record projection is insufficient, that is design evidence for a
small edge-record API improvement before this slice proceeds.

## Non-Goals

- Do not change edge patch operation shape.
- Do not add edge schema validation.
- Do not change public `getEdges()` or `getEdgeProps()` return shape.
- Do not migrate old edge properties.
- Do not treat edge content metadata as native content storage.

## RED Plan

Add tests that fail until edge projection exists:

- a visible edge with properties projects immutable edge property records;
- an edge removed after property assignment does not project properties;
- a property keyed to malformed edge coordinates fails closed;
- content compatibility keys are classified without corrupting public values.

## GREEN Plan

Implement the projection in a concept-named graph-substrate file. Reuse
`EdgeRecord` as the visibility gate. Keep iteration deterministic by sorting
on edge identity and property key where no stronger order already exists.

Tests should compare record values, not JSON string output.

## Verification

```text
npx vitest run test/unit/domain/graph/EdgePropertyProjection.test.ts --reporter=verbose
npx eslint src/domain/graph test/unit/domain/graph/EdgePropertyProjection.test.ts
npm run typecheck
npm run lint:sludge
git diff --check HEAD
```

## Closeout Criteria

- Visible edge property projection exists.
- Edge visibility comes from the edge-record projection.
- Content compatibility key handling is explicit.
- The next slice can route query reads through node and edge projections.

## SSJS Scorecard

- Runtime-backed forms: green when edge properties are frozen records.
- Boundary validation: green when malformed edge keys fail at projection
  construction.
- Behavior ownership: green when edge visibility is delegated to edge records.
- Message parsing: green; no parsed prose controls logic.
- Ambient time or entropy: green; no ambient sources.
- Fake shape trust or cast-cosplay: green when casts are not introduced.
