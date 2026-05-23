---
cycle: 0170
task_id: V18_content_attachment_payload_nouns
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
completed_at: 2026-05-23
release_home: v18.0.0
bearing_task: 22
promotes_backlog:
  - docs/method/backlog/v18.0.0/PROTO_content-attachment-plane-cutover.md
---

# V18 Content Attachment Payload Nouns

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Name content-specific attachment payload concepts over the generic attachment
plane without changing content reads, writes, or persistence.

## Playback Questions

- Can a content reference be represented as `ContentAttachmentOid` instead of a
  raw `_content` string?
- Can content MIME and byte length metadata be runtime-backed values?
- Can content payload metadata represent absent MIME and size without optional
  field soup?
- Do public exports expose the new nouns without growing `index.ts`?

## Accessibility / Assistive Reading Posture

The nouns are explicit text concepts: OID, MIME, size, and payload. The design
does not rely on visual notation to distinguish generic attachments from
content payloads.

## Localization / Directionality Posture

Content OIDs and MIME hints are protocol/storage identifiers. Validation is
byte-oriented and does not use locale-sensitive collation.

## Agent Inspectability / Explainability Posture

The slice adds the smallest content-specific vocabulary before projection or
write-path work. Future agents can inspect the tests and see that no public
content behavior changed.

## Existing Shape

Generic `AttachmentRecord` exists, and legacy content currently appears as
attachment records with keys `_content`, `_content.mime`, and `_content.size`.
Those keys still do not express a typed content payload.

## Chosen Boundary

This slice introduces:

- `ContentAttachmentOid`;
- `ContentAttachmentMime`;
- `ContentAttachmentSize`;
- `ContentAttachmentPayload`.

The payload owns content metadata values only. Slice 23 should add owner-aware
projection from legacy content attachment records into content attachment
records.

## Non-Goals

- Do not change `QueryContent`.
- Do not change `PatchBuilder.attachContent()` or `attachEdgeContent()`.
- Do not remove `_content*` compatibility properties.
- Do not close the content-cutover backlog note.

## RED

Observed before GREEN:

```text
test/unit/domain/graph/ContentAttachmentPayload.test.ts failed because
ContentAttachmentOid, ContentAttachmentMime, ContentAttachmentSize, and
ContentAttachmentPayload did not exist.
```

## GREEN

The slice adds runtime-backed content payload classes, public exports, and tests
covering:

- OID, MIME, and size validation;
- optional MIME and size metadata;
- payload immutability;
- fake envelope rejection.

## Verification

```text
npx vitest run test/unit/domain/graph/ContentAttachmentPayload.test.ts test/unit/domain/index.exports.test.ts --reporter=verbose
npx eslint src/domain/graph/ContentAttachmentOid.ts src/domain/graph/ContentAttachmentMime.ts src/domain/graph/ContentAttachmentSize.ts src/domain/graph/ContentAttachmentPayload.ts src/domain/graph/publicGraphSubstrate.ts test/unit/domain/graph/ContentAttachmentPayload.test.ts test/unit/domain/index.exports.test.ts
npm run typecheck
npm run lint
npx markdownlint-cli2 CHANGELOG.md docs/BEARING.md docs/design/0170-v18-content-attachment-payload-nouns/v18-content-attachment-payload-nouns.md
```

## Closeout

Content now has typed payload nouns over the generic attachment plane. Slice 23
should project legacy `_content*` attachment records into owner-aware typed
content attachment records.

## SSJS Scorecard

- Runtime-backed forms: green; OID, MIME, size, and payload are classes with
  constructor validation and `Object.freeze`.
- Boundary validation: green; raw legacy strings and numbers must pass
  constructors before becoming content payload values.
- Behavior ownership: green; content payload metadata lives on content payload
  nouns, not on query controllers.
- Message parsing: green; no behavior branches parse message text.
- Ambient time or entropy: green; no clocks, dates, timers, or randomness.
- Fake shape trust or cast-cosplay: green; no assertions or placeholder
  `*Like` types introduced.
