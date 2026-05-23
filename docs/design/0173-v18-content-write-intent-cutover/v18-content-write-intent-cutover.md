---
cycle: 0173
task_id: V18_content_write_intent_cutover
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
completed_at: 2026-05-23
release_home: v18.0.0
bearing_task: 25
promotes_backlog:
  - docs/method/backlog/v18.0.0/PROTO_content-attachment-plane-cutover.md
---

# V18 Content Write Intent Cutover

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Make content writes construct runtime-backed typed content attachment intent
before lowering to the existing legacy `_content*` compatibility properties.

## Playback Questions

- Does a content write have a named runtime-backed intent before legacy
  property emission?
- Does PatchBuilder reject malformed blob-storage OIDs before `_content*`
  operations are appended?
- Do streamed content writes validate MIME and size through typed content
  payload nouns before edge property lowering?
- Does the public output remain the same legacy property patch shape for
  compatibility?

## Accessibility / Assistive Reading Posture

The intent noun exposes simple target and payload accessors. Tests describe the
node target, edge target, storage OID, MIME, and size as plain values.

## Localization / Directionality Posture

Write targets, storage OIDs, and MIME hints remain protocol identifiers.
Lowering preserves exact strings and does not apply locale-sensitive
normalization.

## Agent Inspectability / Explainability Posture

Agents can now distinguish content write intent from legacy compatibility
lowering. `ContentAttachmentWriteIntent` owns typed target/payload binding;
`PatchBuilder` owns blob storage and compatibility property emission.

## Existing Shape

Before this slice, `PatchBuilder.attachContent()` and
`PatchBuilder.attachEdgeContent()` stored blobs, then wrote `_content`,
`_content.size`, and `_content.mime` properties directly. That meant invalid
blob-storage OIDs or malformed streamed MIME hints could reach patch ops before
the typed content payload nouns had any chance to validate them.

## Chosen Boundary

This slice introduces `ContentAttachmentWriteIntent` in the graph substrate
package. The intent binds a `ContentAttachmentPayload` to either a node target
or an edge target using existing runtime-backed owner records.

`PatchBuilder` now:

- stores buffered or streamed content through the existing blob storage port;
- constructs a `ContentAttachmentPayload` from the returned OID and metadata;
- constructs a `ContentAttachmentWriteIntent` for the node or edge target;
- lowers that intent to the current legacy `_content*` compatibility
  properties.

The persistence shape intentionally does not change in this slice.

## Non-Goals

- Do not remove legacy `_content*` properties.
- Do not change the public content write API.
- Do not change blob storage adapters.
- Do not route general property writes through graph-op algebra yet.
- Do not close the content-cutover backlog note.

## RED

Observed before GREEN:

```text
test/unit/domain/graph/ContentAttachmentWriteIntent.test.ts failed because
ContentAttachmentWriteIntent did not exist.

test/unit/domain/services/PatchBuilderContentWriteIntent.test.ts failed
because PatchBuilder accepted an empty blob-storage OID and an empty streamed
edge MIME hint, lowering both into legacy content properties.
```

## GREEN

The slice adds `ContentAttachmentWriteIntent`, exports it through the graph
substrate public surface, and routes PatchBuilder content writes through typed
intent construction before property lowering.

Regression coverage now proves:

- node write intents expose node target and typed payload values;
- edge write intents expose edge target and typed payload values;
- wrong target accessor use is rejected;
- malformed stored OIDs do not lower into node `_content*` ops;
- malformed streamed edge MIME hints do not lower into edge `_content*` ops.

## Verification

```text
npx vitest run test/unit/domain/graph/ContentAttachmentWriteIntent.test.ts test/unit/domain/services/PatchBuilderContentWriteIntent.test.ts test/unit/domain/index.exports.test.ts --reporter=verbose
npx eslint src/domain/graph/ContentAttachmentWriteIntent.ts src/domain/graph/publicGraphSubstrate.ts src/domain/services/PatchBuilder.ts test/unit/domain/graph/ContentAttachmentWriteIntent.test.ts test/unit/domain/services/PatchBuilderContentWriteIntent.test.ts test/unit/domain/index.exports.test.ts
npm run typecheck
npm run lint
npm run lint:sludge
npm run lint:quarantine-graduate
npx markdownlint-cli2 CHANGELOG.md docs/BEARING.md docs/design/0173-v18-content-write-intent-cutover/v18-content-write-intent-cutover.md
git diff --check HEAD
```

## Closeout

The content cutover path now has typed read projection and typed write intent
over the legacy compatibility property plane. The next branch can move to
legacy property-bag projection, graph-model migration tooling, and genesis
replay equivalence.

## SSJS Scorecard

- Runtime-backed forms: green; `ContentAttachmentWriteIntent` is a frozen
  class over typed content payloads and owner records.
- Boundary validation: green; blob-storage OIDs, MIME hints, and sizes pass
  through runtime-backed content payload constructors before lowering.
- Behavior ownership: green; intent construction is separate from legacy
  property emission.
- Message parsing: green; no behavior branches parse message text.
- Ambient time or entropy: green; no clocks, dates, timers, or randomness.
- Fake shape trust or cast-cosplay: green; no assertions or placeholder
  `*Like` types introduced.
