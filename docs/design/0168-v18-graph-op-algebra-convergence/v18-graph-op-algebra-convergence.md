---
cycle: 0168
task_id: V18_graph_op_algebra_convergence
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
completed_at: 2026-05-22
release_home: v18.0.0
bearing_task: 20
promotes_backlog:
  - docs/method/backlog/v18.0.0/PROTO_graph-op-algebra-convergence.md
---

# V18 Graph-Op Algebra Convergence

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Introduce an explicit graph-operation algebra over node records, edge records,
and attachment records so graph truth can be named without treating legacy
property ops as the substrate contract.

## Playback Questions

- Can graph skeleton edits be represented as node-record and edge-record
  operations?
- Can payload edits be represented as attachment-set operations over
  `AttachmentRecord`?
- Can current materialized state project into the graph algebra
  deterministically?
- Does the slice avoid changing patch persistence before replay equivalence and
  migration tooling exist?

## Accessibility / Assistive Reading Posture

The algebra uses named operation classes and text operation names. No diagram is
required to understand the split between node, edge, and attachment operations.

## Localization / Directionality Posture

The graph-operation names are protocol identifiers. Ordering is inherited from
the deterministic record views introduced in slices 17 through 19 and does not
use locale-sensitive collation.

## Agent Inspectability / Explainability Posture

The promoted backlog item is removed from the live backlog, workload counts are
updated, and BEARING records the slice outcome. Agents can inspect the
projection service to see that graph algebra is now the exposed substrate view
while legacy patch persistence remains intact.

## Existing Shape

Before this slice:

- `NodeAdd` and `EdgeAdd` were structural operations.
- `PropSet`, `NodePropSet`, and `EdgePropSet` still represented graph payloads
  as property traffic.
- Slices 17 through 19 introduced `NodeRecord`, `EdgeRecord`, and
  `AttachmentRecord`, but there was no operation algebra over those records.

## Chosen Boundary

This slice introduces:

- `GraphNodeRecordSetOp`, a runtime-backed operation over `NodeRecord`.
- `GraphEdgeRecordSetOp`, a runtime-backed operation over `EdgeRecord`.
- `GraphAttachmentSetOp`, a runtime-backed operation over `AttachmentRecord`.
- `GraphOpAlgebra`, an immutable operation collection.
- `GraphOpAlgebraProjection.fromState()`, a deterministic projection from
  `WarpState` record views into graph operations.

The graph algebra is intentionally a projection in this slice. Persisted patch
lowering still uses the legacy causal envelope. That keeps replay stable while
giving the next slices a concrete algebra to migrate, compare, and witness.

## Non-Goals

- Do not change patch encoding or checkpoint serialization.
- Do not delete `PropSet`, `NodePropSet`, or `EdgePropSet` yet.
- Do not migrate existing commits.
- Do not introduce a native Continuum witness claim.

## RED

Observed before GREEN:

```text
test/unit/domain/graph/GraphOpAlgebra.test.ts failed because graph operation
classes and GraphOpAlgebra did not exist.
test/unit/domain/services/GraphOpAlgebraProjection.test.ts failed because
GraphOpAlgebraProjection did not exist.
```

## GREEN

This slice adds runtime-backed graph-operation classes, a deterministic
algebra projection, public exports, and tests covering:

- graph node, edge, and attachment operation construction;
- runtime rejection of fake operation shapes;
- deterministic state projection into graph algebra;
- absence of legacy property op names from the graph substrate projection.

## Verification

```text
npx vitest run test/unit/domain/graph/GraphOpAlgebra.test.ts test/unit/domain/services/GraphOpAlgebraProjection.test.ts test/unit/domain/index.exports.test.ts --reporter=verbose
npx eslint src/domain/graph/GraphNodeRecordSetOp.ts src/domain/graph/GraphEdgeRecordSetOp.ts src/domain/graph/GraphAttachmentSetOp.ts src/domain/graph/GraphOperation.ts src/domain/graph/GraphOpAlgebra.ts src/domain/services/GraphOpAlgebraProjection.ts test/unit/domain/graph/GraphOpAlgebra.test.ts test/unit/domain/services/GraphOpAlgebraProjection.test.ts test/unit/domain/index.exports.test.ts
npm run typecheck
npm run lint
npx markdownlint-cli2 CHANGELOG.md docs/BEARING.md docs/design/0168-v18-graph-op-algebra-convergence/v18-graph-op-algebra-convergence.md docs/method/backlog/WORKLOADS.md docs/method/backlog/v18.0.0/README.md
```

## Closeout

Slice 20 gives git-warp a runtime-backed graph-operation algebra over the
records introduced in slices 17 through 19. The next PR should use this algebra
for content attachment-plane cutover, legacy property projection, and replay
equivalence checks.

## SSJS Scorecard

- Runtime-backed forms: green; graph node, edge, and attachment operations are
  classes with constructor validation and `Object.freeze`.
- Boundary validation: green; projection accepts a real `WarpState` and fake
  operation shapes are rejected at constructors.
- Behavior ownership: green; operation classes own operation identity,
  `GraphOpAlgebra` owns operation collection validation, and the projection
  service owns state-to-algebra translation.
- Message parsing: green; no behavior branches parse message text.
- Ambient time or entropy: green; no clocks, dates, timers, or randomness.
- Fake shape trust or cast-cosplay: green; no assertions or placeholder
  `*Like` types introduced.
