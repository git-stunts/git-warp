---
cycle: 0183
task_id: V18_property_projection_closeout
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
release_home: v18.0.0
bearing_task: 35
promotes_backlog:
  - docs/method/backlog/v18.0.0/PROTO_legacy-props-as-projection.md
---

# V18 Property Projection Closeout

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Close the legacy-property projection work only after query reads, state
reader, graph-op algebra, docs, and changelog all agree that property bags are
compatibility views.

## Playback Questions

- Is every direct raw property read either removed or justified by a named
  compatibility boundary?
- Does public documentation explain compatibility properties versus graph
  substrate facts?
- Is the backlog note updated with evidence, not optimism?
- Do query and state-reader behavior remain compatible?
- Is migration work explicitly still pending?

## Existing Shape

By the time this slice starts, the preceding slices should have added property
projection nouns, node and edge projections, query routing, state-reader
routing, property write intents, and graph-op projection cutover.

The closeout slice is the gate that prevents almost-done work from being
declared complete while stale direct reads remain.

## Chosen Boundary

Run a targeted source audit for direct property-map interpretation. Expected
remaining direct reads, if any, must live in a named projection boundary or a
documented temporary migration inventory boundary.

Then update:

- `docs/BEARING.md`;
- `CHANGELOG.md`;
- the relevant v18 backlog note;
- any public docs that still imply property bags are substrate truth.

Closeout is allowed to be docs-heavy, but only after code evidence is in hand.

## Non-Goals

- Do not implement the migration tool in this slice.
- Do not claim content persistence has fully left `_content*`.
- Do not remove legacy storage.
- Do not change package versions.
- Do not hide remaining debt without a backlog entry.

## RED Plan

Before closeout, run audits that should fail if direct raw-property ownership
leaks:

```text
rg "decodePropKey|decodeEdgePropKey|state\\.prop" src/domain
```

The expected failing evidence is any call site outside named projection or
migration inventory boundaries.

The closeout audit found one live read-model leak: `StateQueryReadModel`
still read `state.prop` directly and accepted malformed compatibility keys
as visible node properties. The regression now proves that malformed node
and edge compatibility keys are skipped through `NodePropertyProjection`.

## GREEN Plan

Fix or document each remaining direct read. Update docs with precise language:
legacy property bags are compatibility projections; graph substrate facts are
node records, edge records, attachments, content records, and graph-op
algebra.

Mark the backlog item complete only if its acceptance criteria are met.

## Evidence

Public and observer-facing property views now route through projection nouns:

- `QueryReads` node props, edge props, edge-list props, and property counts;
- `StateReaderContext` node props, edge props, and content views;
- `StateQueryReadModel.nodeProps`;
- `TranslationCost` node property-key accounting;
- `GraphOpAlgebraProjection` typed content, node-property, and edge-property
  operations.

The full unit suite also caught two integration details that targeted checks
missed. `createStateReader()` still needs to accept immutable
`SnapshotWarpState` values returned by coordinate and strand materialization,
so the closeout hydrates those snapshots into projection-local `WarpState`
values before invoking projection nouns. `PatchBuilder` also keeps the
reserved-byte validation errors from the public API before property write
intent construction, so the intent cutover does not change caller-visible
validation behavior.

The remaining direct raw-property sites are deliberately bounded:

- `ContentAttachmentProjection` reads legacy `_content*` compatibility keys
  until content persistence migrates;
- reducers, op strategies, and prop helper modules own legacy compatibility
  mutation;
- checkpoint serializers, state serializers, state diffs, visible-state
  scoping, and logical-index build code preserve or transform raw state;
- `TemporalQuery` replay snapshots still accept pre-codec inline fixture
  classes that strict `LegacyPropertyValue` projection nouns reject;
- `PatchBuilderValidation` scans raw compatibility keys for delete guards;
- `KeyCodec` owns the legacy encoding and decoding functions.

Those are not graph-substrate truth claims. They are compatibility,
serialization, replay, reducer, or migration-source boundaries for the next
batch to inventory before any write-capable migration exists.

## Verification

```text
rg "decodePropKey|decodeEdgePropKey|state\\.prop" src/domain
npm run test:local
npm run typecheck
npm run lint
npm run lint:sludge
npx markdownlint-cli2 CHANGELOG.md docs/BEARING.md docs/method/backlog/v18.0.0/PROTO_legacy-props-as-projection.md docs/design/0183-v18-property-projection-closeout/v18-property-projection-closeout.md
git diff --check HEAD
```

## Closeout Criteria

- Backlog acceptance criteria are checked against source evidence.
- Any remaining raw-property reads are named and justified.
- Documentation no longer describes property bags as substrate truth.
- The next slice can start graph-model migration manifest work.

## Closeout Outcome

The slice closes the legacy-property projection backlog for public property
views and graph-op algebra. It does not close raw legacy property storage.
That storage is the explicit input to slices 36 through 40: migration
manifest, source inventory, dry-run planner, ordered history input, and
manifest serialization.

## SSJS Scorecard

- Runtime-backed forms: green; public property views use projection
  records.
- Boundary validation: green; remaining legacy decoding is bounded and
  recorded.
- Behavior ownership: green; closeout records source ownership clearly.
- Message parsing: green; no message parsing.
- Ambient time or entropy: green; no code that uses ambient sources.
- Fake shape trust or cast-cosplay: green; no casts are introduced.
