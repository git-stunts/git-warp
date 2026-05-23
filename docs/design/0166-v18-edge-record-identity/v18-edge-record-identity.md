---
cycle: 0166
task_id: V18_edge_record_identity
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
completed_at: 2026-05-22
release_home: v18.0.0
bearing_task: 18
promotes_backlog:
  - docs/method/backlog/v18.0.0/PROTO_echo-shaped-edge-records.md
---

# V18 Edge Record Identity

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Introduce runtime-backed graph edge identity and edge records while preserving a
deterministic legacy mapping from `(from, to, label)` keys until graph-op
algebra can carry native edge ids.

## Playback Questions

- Can graph edge identity be named as an `EdgeId` instead of an encoded triple
  string?
- Can edge type be represented by `EdgeTypeId` separately from edge identity?
- Can `WarpState` expose visible edges as deterministic edge records filtered
  by both edge liveness and endpoint node liveness?
- Does the legacy triple-to-record mapping remain explicit, deterministic, and
  documented?

## Accessibility / Assistive Reading Posture

The slice is code and text only. Edge identity, endpoint, and type are named
fields on `EdgeRecord`, so readers do not need a diagram to distinguish record
identity from legacy key encoding.

## Localization / Directionality Posture

Edge ids and type ids are protocol identifiers. The transitional legacy id
mapping uses length-prefixed ASCII framing and direct string comparison, not
locale-sensitive formatting or collation.

## Agent Inspectability / Explainability Posture

The promoted backlog item is removed from the live backlog, workload counts are
updated, and BEARING records the edge-record outcome. Agents can inspect the
state view and see that this slice does not change the persisted wire format.

## Existing Shape

Before this slice:

- `EdgeAdd` encoded `(from, to, label)` through `encodeEdgeKey()`.
- `WarpState.edgeAlive` stored encoded edge keys in an OR-Set.
- Query reads decoded edge keys and treated `label` as both edge type and part
  of identity.

## Chosen Boundary

This slice introduces:

- `EdgeId`, a runtime-backed edge identity value.
- `EdgeTypeId`, a runtime-backed edge type value.
- `EdgeRecord`, a runtime-backed graph edge record with `id`, `from`, `to`,
  and `typeId`.
- `EdgeRecord.fromLegacyEdge()`, the explicit transitional mapping from
  `(from, to, label)` to a stable record.
- `WarpState.edgeRecords()`, `getEdgeRecord()`, and `hasEdgeRecord()` as the
  state-level record view.

The legacy `label` still participates in the generated transitional `EdgeId`
because existing history has no separate persisted edge id. The important cut
for this slice is that runtime code can now talk about edge identity and edge
type separately.

## Non-Goals

- Do not change the persisted patch wire format.
- Do not delete `encodeEdgeKey()` or the legacy edge OR-Set.
- Do not introduce attachment slots; that is slice 19.
- Do not migrate existing graph history; that belongs after the substrate nouns
  and graph-op algebra exist.

## RED

Observed before GREEN:

```text
test/unit/domain/services/state/WarpState.edgeRecords.test.ts failed because
WarpState did not expose edgeRecords(), getEdgeRecord(), or hasEdgeRecord().
```

## GREEN

This slice adds runtime-backed edge identity classes, state-level edge record
reads, public exports, and tests covering:

- edge id and type id validation;
- deterministic legacy edge id mapping;
- edge record immutability and equality;
- deterministic visible edge record ordering;
- endpoint-liveness filtering and edge tombstone filtering.

## Verification

```text
npx vitest run test/unit/domain/graph/EdgeRecord.test.ts test/unit/domain/services/state/WarpState.edgeRecords.test.ts test/unit/domain/index.exports.test.ts --reporter=verbose
npx eslint src/domain/graph/EdgeId.ts src/domain/graph/EdgeTypeId.ts src/domain/graph/EdgeRecord.ts src/domain/services/state/WarpState.ts test/unit/domain/graph/EdgeRecord.test.ts test/unit/domain/services/state/WarpState.edgeRecords.test.ts test/unit/domain/index.exports.test.ts
npm run typecheck
npm run lint
npx markdownlint-cli2 CHANGELOG.md docs/BEARING.md docs/design/0166-v18-edge-record-identity/v18-edge-record-identity.md docs/method/backlog/WORKLOADS.md docs/method/backlog/v18.0.0/README.md
```

## Closeout

Slice 18 gives git-warp a runtime-backed graph edge record surface while legacy
edge keys remain replay-compatible. Slice 19 should add the attachment-plane
substrate spine over these node and edge record nouns.

## SSJS Scorecard

- Runtime-backed forms: green; edge ids, edge type ids, and edge records are
  classes with constructor validation and `Object.freeze`.
- Boundary validation: green; legacy strings are validated before becoming
  domain ids.
- Behavior ownership: green; `EdgeRecord` owns graph edge identity behavior,
  while `WarpState` owns materialized state record views.
- Message parsing: green; no behavior branches parse message text.
- Ambient time or entropy: green; no clocks, dates, timers, or randomness.
- Fake shape trust or cast-cosplay: green; no assertions or placeholder
  `*Like` types introduced.
