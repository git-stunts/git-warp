---
cycle: 0167
task_id: V18_attachment_plane_substrate
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
completed_at: 2026-05-22
release_home: v18.0.0
bearing_task: 19
promotes_backlog:
  - docs/method/backlog/v18.0.0/PROTO_attachment-plane-substrate.md
---

# V18 Attachment-Plane Substrate

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Add the first runtime-backed attachment-plane substrate over node and edge
records, while keeping legacy property storage intact until graph-op algebra
and content cutover can move writes onto the new nouns.

## Playback Questions

- Can the domain name an attachment slot as `AttachmentKey` instead of a raw
  property key string?
- Can attachment values carry an explicit schema version?
- Can `WarpState` expose node and edge payloads as deterministic
  `AttachmentRecord` values separate from skeleton records?
- Does the slice avoid pretending that legacy properties have already stopped
  existing?

## Accessibility / Assistive Reading Posture

The attachment plane is exposed as named fields on `AttachmentRecord`: owner,
key, value, and schema version. The design does not depend on diagrams to show
the split between graph skeleton and payload slots.

## Localization / Directionality Posture

Attachment keys are protocol identifiers. Ordering uses direct string
comparison, not locale-sensitive collation.

## Agent Inspectability / Explainability Posture

The promoted backlog item is removed from the live backlog, workload counts are
updated, and BEARING records the slice outcome. The code makes the transitional
legacy property projection explicit in `WarpState.attachmentRecords()`.

## Existing Shape

Before this slice:

- Node and edge payloads lived in `WarpState.prop`.
- Content attachments were represented by `_content`, `_content.mime`, and
  `_content.size` property conventions.
- Read APIs interpreted properties directly instead of passing through a
  runtime-backed attachment record.

## Chosen Boundary

This slice introduces:

- `AttachmentKey`, a runtime-backed attachment slot id.
- `AttachmentSchemaVersion`, a runtime-backed version number.
- `AttachmentRecord`, a runtime-backed payload record owned by a `NodeRecord`
  or `EdgeRecord`.
- `WarpState.attachmentRecords()`, which projects the legacy property map into
  deterministic node and edge attachment records.

The storage source remains `state.prop` in this slice. That is deliberate:
slice 19 establishes the attachment-plane vocabulary and state read surface;
slice 20 can then start graph-op algebra without also performing the full
content/property write cutover.

## Non-Goals

- Do not delete or rewrite the legacy property map.
- Do not migrate `_content` conventions yet; that belongs to the content
  attachment-plane cutover.
- Do not change checkpoint serialization.
- Do not introduce a native Continuum witness claim.

## RED

Observed before GREEN:

```text
test/unit/domain/services/state/WarpState.attachmentRecords.test.ts failed
because WarpState did not expose attachmentRecords().
```

## GREEN

This slice adds runtime-backed attachment classes, state-level attachment reads,
public exports, and tests covering:

- attachment key and schema version validation;
- node-owned and edge-owned attachment record construction;
- deterministic state attachment ordering;
- filtering of attachments whose node or edge owner is not visible;
- stale edge-property filtering against edge birth events.

## Verification

```text
npx vitest run test/unit/domain/graph/AttachmentRecord.test.ts test/unit/domain/services/state/WarpState.attachmentRecords.test.ts test/unit/domain/index.exports.test.ts --reporter=verbose
npx eslint src/domain/graph/AttachmentKey.ts src/domain/graph/AttachmentRecord.ts src/domain/graph/AttachmentSchemaVersion.ts src/domain/services/state/WarpState.ts test/unit/domain/graph/AttachmentRecord.test.ts test/unit/domain/services/state/WarpState.attachmentRecords.test.ts test/unit/domain/index.exports.test.ts
npm run typecheck
npm run lint
npx markdownlint-cli2 CHANGELOG.md docs/BEARING.md docs/design/0167-v18-attachment-plane-substrate/v18-attachment-plane-substrate.md docs/method/backlog/WORKLOADS.md docs/method/backlog/v18.0.0/README.md
```

## Closeout

Slice 19 gives git-warp a runtime-backed attachment-plane read surface. Slice
20 should use the node, edge, and attachment nouns to start the explicit
graph-op algebra.

## SSJS Scorecard

- Runtime-backed forms: green; attachment keys, schema versions, and records
  are classes with constructor validation and `Object.freeze`.
- Boundary validation: green; legacy property keys and values are validated
  before becoming attachment records.
- Behavior ownership: green; `AttachmentRecord` owns payload-slot identity,
  while `WarpState` owns materialized attachment projection.
- Message parsing: green; no behavior branches parse message text.
- Ambient time or entropy: green; no clocks, dates, timers, or randomness.
- Fake shape trust or cast-cosplay: green; no assertions or placeholder
  `*Like` types introduced.
