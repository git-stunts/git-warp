---
cycle: 0165
task_id: V18_node_record_identity
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
completed_at: 2026-05-22
release_home: v18.0.0
bearing_task: 17
promotes_backlog:
  - docs/method/backlog/v18.0.0/PROTO_echo-shaped-node-records.md
---

# V18 Node Record Identity

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Introduce runtime-backed graph node identity and node records without confusing
them with the existing `GraphNode` Git-commit entity or claiming that Echo owns
git-warp's graph model.

## Playback Questions

- Can the domain construct and compare graph node ids as runtime-backed values
  instead of bare strings?
- Can the materialized state expose live nodes as deterministic node records,
  not only as raw OR-Set elements?
- Does the compatibility layer keep the legacy string node id mapping
  deterministic until the graph-op algebra cut can carry typed node records
  directly?
- Do exported public symbols make the new graph node nouns discoverable without
  changing the existing `GraphNode` commit-log meaning?

## Accessibility / Assistive Reading Posture

The new nouns are code-level concepts with text names: `NodeId`, `NodeTypeId`,
and `NodeRecord`. The design and tests use explicit names instead of relying on
visual diagrams or shorthand.

## Localization / Directionality Posture

Node ids and type ids are protocol identifiers. Validation is byte-oriented and
does not use locale-sensitive collation. Deterministic ordering uses direct
string comparison.

## Agent Inspectability / Explainability Posture

The promoted backlog item is removed from the live backlog, the workload counts
are updated, and BEARING records the slice outcome. Agents can inspect the
record view from `WarpState` and see that the legacy OR-Set remains the storage
source for this slice.

## Existing Shape

Before this slice:

- `NodeAdd` validated a bare string and added it to `state.nodeAlive`.
- `WarpState` exposed liveness through `nodeAlive.contains()` and
  `nodeAlive.elements()`.
- `GraphNode` already existed, but it represented a Git commit from log
  parsing, not a graph substrate node.

## Chosen Boundary

This slice introduces the graph-model record nouns and a deterministic record
view over the existing OR-Set:

- `NodeId` validates legacy-compatible node identifiers.
- `NodeTypeId` validates node type identifiers.
- `NodeRecord` owns node identity and type.
- `WarpState.nodeRecords()` returns deterministic live `NodeRecord` values.
- `WarpState.getNodeRecord()` and `WarpState.hasNodeRecord()` let state readers
  talk about records directly.

The default type id is `untyped-node` because existing `NodeAdd` ops do not yet
carry node type. Slice 20 can replace that transitional default when graph-op
algebra carries explicit typed node records.

## Non-Goals

- Do not rename or repurpose `GraphNode`; it remains the Git commit-log entity.
- Do not change the persisted patch wire format in this slice.
- Do not move content or properties into attachments; that belongs to later
  attachment-plane slices.
- Do not introduce a native Continuum witness claim.

## RED

Observed before GREEN:

```text
test/unit/domain/services/state/WarpState.nodeRecords.test.ts failed because
WarpState did not expose nodeRecords(), getNodeRecord(), or hasNodeRecord().
```

## GREEN

This slice adds runtime-backed graph node identity classes, state-level node
record reads, public exports, and tests covering:

- node id and type id validation;
- node record immutability and equality;
- deterministic live node record ordering;
- node tombstone filtering through the existing OR-Set liveness semantics.

## Verification

```text
npx vitest run test/unit/domain/graph/NodeRecord.test.ts test/unit/domain/services/state/WarpState.nodeRecords.test.ts test/unit/domain/index.exports.test.ts --reporter=verbose
npx eslint src/domain/graph/NodeId.ts src/domain/graph/NodeTypeId.ts src/domain/graph/NodeRecord.ts src/domain/services/state/WarpState.ts test/unit/domain/graph/NodeRecord.test.ts test/unit/domain/services/state/WarpState.nodeRecords.test.ts test/unit/domain/index.exports.test.ts
npm run typecheck
npm run lint
npx markdownlint-cli2 CHANGELOG.md docs/BEARING.md docs/design/0165-v18-node-record-identity/v18-node-record-identity.md docs/method/backlog/WORKLOADS.md docs/method/backlog/v18.0.0/README.md
```

## Closeout

Slice 17 gives git-warp a runtime-backed graph node record surface while keeping
legacy replay stable. Slice 18 should perform the equivalent identity cut for
edges.

## SSJS Scorecard

- Runtime-backed forms: green; graph node ids, type ids, and records are
  classes with constructor validation and `Object.freeze`.
- Boundary validation: green; legacy strings are validated before becoming
  domain ids.
- Behavior ownership: green; `NodeRecord` owns graph node identity behavior,
  while `WarpState` owns materialized state record views.
- Message parsing: green; no behavior branches parse message text.
- Ambient time or entropy: green; no clocks, dates, timers, or randomness.
- Fake shape trust or cast-cosplay: green; no assertions or placeholder
  `*Like` types introduced.
