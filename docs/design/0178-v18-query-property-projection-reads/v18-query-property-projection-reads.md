---
cycle: 0178
task_id: V18_query_property_projection_reads
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
completed_at: 2026-05-23
release_home: v18.0.0
bearing_task: 30
promotes_backlog:
  - docs/method/backlog/v18.0.0/PROTO_legacy-props-as-projection.md
---

# V18 Query Property Projection Reads

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Route public query property reads through the node and edge property
projections without changing public output.

## Playback Questions

- Does `getNodeProps()` stop decoding raw `state.prop` keys directly?
- Does `getEdgeProps()` stop decoding raw `state.prop` keys directly?
- Does `getEdges()` preserve property payloads while using projection-backed
  compatibility records?
- Do existing query fixtures pass unchanged?
- Are content compatibility keys exposed or hidden exactly as they were before
  this slice?

## Existing Shape

`src/domain/services/controllers/QueryReads.ts` contains direct raw-property
logic. It has to understand node property keys, edge property keys, edge
identity, visible registers, and formatting. That is too much ownership for a
query formatting controller.

The controller should format query answers from named read-model concepts.

## Chosen Boundary

Keep `QueryReads` as the public formatting layer, but replace raw
property-map scans with calls into the property projections from slices 28 and
29.

The slice should preserve:

- return object keys;
- inline value decoding behavior;
- missing-node and missing-edge behavior;
- deterministic edge ordering;
- content compatibility behavior.

If existing tests depend on accidental raw-map order, update the projection to
match the public contract rather than changing assertions casually.

## Non-Goals

- Do not redesign the query API.
- Do not change content read behavior.
- Do not remove the raw property map from `WarpState`.
- Do not add migration logic.
- Do not broaden query reads beyond current state snapshots.

## RED Plan

Added characterization tests around the public query behavior before rewiring:

- node property reads return the same object shape after projection routing;
- edge property reads return the same object shape after projection routing;
- `getEdges()` includes the same property payloads for representative edges;
- reserved content compatibility keys behave exactly as before.

At least one test asserted an implementation seam: a malformed raw edge
property key must not be able to bypass the projection path.

Observed RED:

```text
npx vitest run test/unit/domain/services/QueryReadsPropertyProjection.test.ts --reporter=verbose
AssertionError: expected { status: 'ready', ... } to deeply equal { _content: 'abc123', status: 'ready' }
```

## GREEN Plan

Constructed property projections at the query-read boundary. Direct calls to
`decodePropKey` and `decodeEdgePropKey` were removed from query property
formatting and replaced with projection records.

Conversion from projection records to public objects stays in small,
concept-named functions near the query controller.

## Verification

```text
npx vitest run test/unit/domain/services/QueryReadsPropertyProjection.test.ts --reporter=verbose
npx eslint src/domain/services/controllers/QueryReads.ts test/unit/domain/services/QueryReadsPropertyProjection.test.ts
npm run typecheck
npm run lint
npm run lint:sludge
git diff --check HEAD
```

Observed GREEN:

```text
npx vitest run test/unit/domain/services/QueryReadsPropertyProjection.test.ts test/unit/domain/services/NodePropertyProjection.test.ts test/unit/domain/services/EdgePropertyProjection.test.ts --reporter=verbose
Test Files  3 passed (3)
Tests  5 passed (5)

npx vitest run test/unit/domain/WarpGraph.query.test.ts test/unit/domain/WarpGraph.edgeProps.test.ts test/unit/domain/WarpGraph.edgePropVisibility.test.ts test/unit/domain/services/QueryReadsPropertyProjection.test.ts --reporter=verbose
Test Files  4 passed (4)
Tests  47 passed (47)

npm run typecheck
npm run lint
npm run lint:sludge
```

## Closeout Criteria

- Public query property reads are projection-backed.
- Public behavior remains compatible.
- Direct raw property decoding is removed from the query controller where the
  projection owns that behavior.
- The first property-projection implementation batch is PR-ready.

## SSJS Scorecard

- Runtime-backed forms: green; query formatting consumes property records.
- Boundary validation: green; raw keys are decoded only inside projection.
- Behavior ownership: green; the query controller formats, not decodes.
- Message parsing: green; no prose-driven logic.
- Ambient time or entropy: green; no domain clocks or randomness.
- Fake shape trust or cast-cosplay: green when no assertions are added.
