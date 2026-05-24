---
cycle: 0182
task_id: V18_graph_op_projection_property_cutover
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
release_home: v18.0.0
bearing_task: 34
promotes_backlog:
  - docs/method/backlog/v18.0.0/PROTO_legacy-props-as-projection.md
---

# V18 Graph Op Projection Property Cutover

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Make graph-op algebra consume property projection records instead of raw
legacy property maps, so property operations are compatibility facts rather
than substrate truth.

## Playback Questions

- Does `GraphOpAlgebraProjection` read node and edge property projections?
- Are content attachment records still represented by content attachment
  projection, not generic property records?
- Are graph attachment facts and property compatibility facts separated?
- Does graph-op algebra preserve deterministic ordering?
- Do existing graph-op algebra tests still pass with the new source?

## Existing Shape

Graph-op algebra exists over current node, edge, and attachment records. The
attachment plane currently sees legacy node and edge properties. That is a
useful bridge, but the next layer should make the property compatibility
surface explicit so graph-op algebra does not learn too much about legacy raw
state.

## Chosen Boundary

Refactor graph-op algebra projection to accept or construct named projections:

- node records;
- edge records;
- content attachment records;
- node property compatibility records;
- edge property compatibility records.

Generic attachment projection should remain available for future schema-backed
attachments. Content should keep using typed content projection. Property bags
should be represented as compatibility records, not as substrate attachment
facts pretending to be native graph model.

## Non-Goals

- Do not delete generic attachment support.
- Do not change graph-op algebra public output shape unless tests prove the
  old shape was internally inconsistent.
- Do not change patch operation classes.
- Do not implement migration.
- Do not close the property-projection backlog item yet if state reader or
  docs are incomplete.

## RED Plan

Add tests proving the projection source changed:

- graph-op algebra includes property compatibility facts through property
  projection records;
- content attachment facts are not duplicated as generic properties;
- deterministic ordering is preserved across mixed node, edge, content, and
  property facts;
- malformed raw property keys do not reach graph-op algebra.

## GREEN Plan

Thread property projection into `GraphOpAlgebraProjection`. Remove any direct
legacy property decoding from that projection. If public graph-op algebra
needs to expose compatibility property operations, create named algebra op
classes or reuse existing ones only where the semantics match exactly.

## Verification

```text
npx vitest run test/unit/domain/graph/GraphOpAlgebraPropertyProjection.test.ts --reporter=verbose
npx eslint src/domain/graph test/unit/domain/graph/GraphOpAlgebraPropertyProjection.test.ts
npm run typecheck
npm run lint
npm run lint:sludge
git diff --check HEAD
```

## Closeout Criteria

- Graph-op algebra consumes named property projections.
- Content attachment facts are not double-counted as generic properties.
- Direct raw property decoding is absent from graph-op algebra projection.
- The next slice can close property projection if docs and state-reader work
  are complete.

## SSJS Scorecard

- Runtime-backed forms: green when graph-op algebra consumes record classes.
- Boundary validation: green when raw property keys are already decoded.
- Behavior ownership: green when graph-op algebra composes projections.
- Message parsing: green; no prose-driven branching.
- Ambient time or entropy: green; no clocks or randomness.
- Fake shape trust or cast-cosplay: green when no assertions are added.
