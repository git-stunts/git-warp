---
cycle: 0175
task_id: V18_legacy_property_projection_nouns
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
completed_at: 2026-05-23
release_home: v18.0.0
bearing_task: 27
promotes_backlog:
  - docs/method/backlog/v18.0.0/PROTO_legacy-props-as-projection.md
---

# V18 Legacy Property Projection Nouns

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Introduce runtime-backed nouns for the legacy property compatibility view so
callers stop treating raw state property maps as the graph substrate.

## Playback Questions

- Is there a named object for a decoded legacy property key?
- Is there a named object for a visible legacy property value?
- Is node-property compatibility separate from edge-property compatibility?
- Are content metadata keys explicitly classified instead of accidentally
  leaking into generic property reads?
- Does the projection preserve existing public values while reducing direct
  property-map interpretation?

## Existing Shape

Today several read paths inspect `state.prop` directly. Query code decodes raw
property keys, state reader code populates property maps, and content metadata
code scans `_content*` compatibility keys. The code works, but the ownership
is blurry: raw legacy property encoding is both persistence detail and public
read model.

That shape blocks the v18 statement that property bags are compatibility
views. A compatibility view needs named runtime forms and a single place where
legacy keys are decoded and classified.

## Chosen Boundary

Add graph-substrate property projection nouns, likely under
`src/domain/graph/` or a focused sibling package:

- a node-property key noun;
- an edge-property key noun;
- a property value noun over current inline values;
- a visible node property record;
- a visible edge property record;
- a projection collection that can be queried by node or edge identity.

The nouns should wrap validated current runtime facts. They must not parse
untrusted JSON, reach into adapters, or invent new persistence. They are a
domain read projection over current `WarpState`.

Reserved content keys require an explicit decision. The safest first behavior
is classification rather than erasure: the projection can identify content
compatibility keys separately so later query cutover can decide whether to
hide or preserve them for the public property API.

## Non-Goals

- Do not remove `state.prop`.
- Do not change `NodePropSet` or `EdgePropSet` patch operation shape.
- Do not change public query output.
- Do not migrate existing histories.
- Do not add a generic `PropertyLike` or `Record<string, unknown>` carrier.

## RED Plan

Added tests that failed because no runtime-backed projection nouns existed:

- constructing a node property record from a malformed node id fails;
- constructing an edge property record from malformed edge coordinates fails;
- content compatibility keys are classified deterministically;
- property records expose owner, key, and value without exposing mutable
  carrier objects.

Observed RED:

```text
npx vitest run test/unit/domain/graph/LegacyPropertyProjection.test.ts --reporter=verbose
Error: Cannot find module '../../../../src/domain/graph/LegacyEdgePropertyKey.ts'
```

## GREEN Plan

Created one file per concept. Constructors validate the smallest possible
runtime boundary and freeze instances. Dispatch uses `instanceof` where the
code needs to distinguish node and edge property records.

The nouns are exported through the graph substrate public surface after tests
proved the intended construction and read behavior.

## Verification

```text
npx vitest run test/unit/domain/graph/LegacyPropertyProjection.test.ts --reporter=verbose
npx eslint src/domain/graph test/unit/domain/graph/LegacyPropertyProjection.test.ts
npm run typecheck
npm run lint:sludge
git diff --check HEAD
```

Observed GREEN:

```text
npx vitest run test/unit/domain/graph/LegacyPropertyProjection.test.ts --reporter=verbose
Test Files  1 passed (1)
Tests  5 passed (5)

npx eslint src/domain/graph/LegacyPropertyKeyClassification.ts src/domain/graph/LegacyNodePropertyKey.ts src/domain/graph/LegacyEdgePropertyKey.ts src/domain/graph/LegacyPropertyValue.ts src/domain/graph/VisibleNodePropertyRecord.ts src/domain/graph/VisibleEdgePropertyRecord.ts src/domain/graph/LegacyPropertyProjection.ts src/domain/graph/publicGraphSubstrate.ts test/unit/domain/graph/LegacyPropertyProjection.test.ts

npm run typecheck
npm run lint:sludge
```

## Closeout Criteria

- Property compatibility has named runtime forms.
- Reserved content compatibility keys are classified by code, not prose.
- No public API behavior changes.
- The next slice can build node-property projection on these nouns.

## SSJS Scorecard

- Runtime-backed forms: green; each property concept is a frozen class.
- Boundary validation: green; raw key values are validated by property key
  nouns.
- Behavior ownership: green; key classification lives with the key noun
  concept.
- Message parsing: green; no behavior branches on diagnostics.
- Ambient time or entropy: green; no clocks or randomness.
- Fake shape trust or cast-cosplay: green when no assertions or placeholder
  shape types are introduced.
