---
cycle: 0176
task_id: V18_node_property_projection
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
completed_at: 2026-05-23
release_home: v18.0.0
bearing_task: 28
promotes_backlog:
  - docs/method/backlog/v18.0.0/PROTO_legacy-props-as-projection.md
---

# V18 Node Property Projection

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Project visible node properties through named compatibility records while
preserving the exact public `getNodeProps()` behavior expected by existing
callers.

## Playback Questions

- Does node property projection use node liveness before exposing values?
- Are tombstoned nodes excluded from visible node property results?
- Does latest-writer conflict resolution match the existing visible-state
  behavior?
- Are `_content*` compatibility keys handled by an explicit classification
  rule?
- Does the projection preserve public key and value shapes?

## Existing Shape

Node properties are currently held in `WarpState.prop` and decoded by callers
that know the legacy key format. Query reads scan the raw map and build a
plain object result. State reader code performs similar work when it populates
node property views.

This duplication means every caller must remember legacy key rules, content
metadata exceptions, and node visibility semantics.

## Chosen Boundary

Build a node-property projection service over the runtime nouns introduced in
slice 27. The projection accepts a materialized `WarpState` and exposes
deterministic node-property records grouped by `NodeRecord`.

The projection must treat the legacy property register as input evidence, not
as public truth. It should:

- decode only node property keys;
- require the owning node to be visible;
- preserve current register resolution semantics;
- classify content compatibility keys;
- emit immutable property records;
- expose a stable iteration order for deterministic tests.

The projection does not own public query formatting. Later query slices can
lower records back to the existing public object shape.

## Non-Goals

- Do not change `graph.query().getNodeProps()` return shape.
- Do not delete raw property storage.
- Do not migrate `_content*` values.
- Do not introduce new property write operations.
- Do not infer schema from property names.

## RED Plan

Added tests that failed without the projection:

- a live node with two properties projects two immutable records;
- a removed node's property register does not appear;
- malformed or edge-shaped property keys are rejected or ignored according to
  the existing visible-state policy;
- content compatibility keys are classified consistently.

Observed RED:

```text
npx vitest run test/unit/domain/services/NodePropertyProjection.test.ts --reporter=verbose
Error: Cannot find module '../../../../src/domain/services/NodePropertyProjection.ts'
```

## GREEN Plan

Implemented `NodePropertyProjection` with explicit `fromState()` and
`forNode()` methods. Supporting functions stay private and concept-named.

The implementation reuses `WarpState.getNodeRecord()` for node liveness
instead of recomputing liveness in a second ad hoc way.

## Verification

```text
npx vitest run test/unit/domain/graph/NodePropertyProjection.test.ts --reporter=verbose
npx eslint src/domain/graph test/unit/domain/graph/NodePropertyProjection.test.ts
npm run typecheck
npm run lint:sludge
git diff --check HEAD
```

Observed GREEN:

```text
npx vitest run test/unit/domain/services/NodePropertyProjection.test.ts --reporter=verbose
Test Files  1 passed (1)
Tests  2 passed (2)

npx eslint src/domain/services/NodePropertyProjection.ts test/unit/domain/services/NodePropertyProjection.test.ts

npm run typecheck
npm run lint:sludge
```

## Closeout Criteria

- Visible node property projection exists as a named domain service.
- Projection tests cover live, removed, malformed, and reserved-key cases.
- Public callers are not rewired yet.
- The next slice can build edge-property projection with the same principles.

## SSJS Scorecard

- Runtime-backed forms: green; visible node properties are records, not raw
  object fragments.
- Boundary validation: green; legacy key decoding happens at projection entry.
- Behavior ownership: green; node visibility belongs to `WarpState` and
  property classification belongs to the property key noun.
- Message parsing: green; no message-string branching.
- Ambient time or entropy: green; no clock or random source.
- Fake shape trust or cast-cosplay: green when no assertions are needed.
