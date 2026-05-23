---
cycle: 0171
task_id: V18_content_attachment_projection
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
completed_at: 2026-05-23
release_home: v18.0.0
bearing_task: 23
promotes_backlog:
  - docs/method/backlog/v18.0.0/PROTO_content-attachment-plane-cutover.md
---

# V18 Content Attachment Projection

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Project legacy `_content*` state entries into typed node and edge content
attachment records while preserving lineage-sensitive metadata behavior.

## Playback Questions

- Can current legacy content state produce typed content attachment records?
- Can projection distinguish node-owned and edge-owned content?
- Does stale metadata from earlier content lineages stay out of typed payloads?
- Does projection avoid treating non-string content references as content?

## Accessibility / Assistive Reading Posture

The projection output names owner and payload explicitly. Tests describe records
as plain text strings so the behavior is inspectable without visual context.

## Localization / Directionality Posture

Content storage references and MIME hints are protocol/storage identifiers.
Projection ordering uses deterministic protocol strings, not locale collation.

## Agent Inspectability / Explainability Posture

The projection is an explicit service instead of hidden query-controller logic.
Agents can inspect it before reads and writes are routed through the cutover
path.

## Existing Shape

Slice 22 introduced content payload nouns. Current state still stores content
through legacy properties:

- `_content`;
- `_content.mime`;
- `_content.size`.

## Chosen Boundary

This slice introduces:

- `ContentAttachmentRecord`, which binds a `ContentAttachmentPayload` to a
  node or edge owner;
- `ContentAttachmentProjection.fromState()`, which reads current `WarpState`
  and returns deterministic typed content attachment records.

The projection scans legacy state directly for this slice because content
metadata lineage depends on property event ids. Generic `AttachmentRecord`
values intentionally do not carry lineage details.

## Non-Goals

- Do not change public content reads yet.
- Do not change content writes yet.
- Do not remove legacy `_content*` properties.
- Do not close the content-cutover backlog note.

## RED

Observed before GREEN:

```text
test/unit/domain/services/ContentAttachmentProjection.test.ts failed because
ContentAttachmentProjection and ContentAttachmentRecord did not exist.
```

## GREEN

The slice adds owner-aware content attachment records, a deterministic state
projection, public exports, and tests covering:

- node and edge content projection;
- stale metadata filtering by event lineage;
- non-string content reference exclusion;
- fake state and record envelope rejection.

## Verification

```text
npx vitest run test/unit/domain/graph/ContentAttachmentRecord.test.ts test/unit/domain/services/ContentAttachmentProjection.test.ts test/unit/domain/index.exports.test.ts --reporter=verbose
npx eslint src/domain/graph/ContentAttachmentRecord.ts src/domain/services/ContentAttachmentProjection.ts src/domain/graph/publicGraphSubstrate.ts test/unit/domain/graph/ContentAttachmentRecord.test.ts test/unit/domain/services/ContentAttachmentProjection.test.ts test/unit/domain/index.exports.test.ts
npm run typecheck
npm run lint
npx markdownlint-cli2 CHANGELOG.md docs/BEARING.md docs/design/0171-v18-content-attachment-projection/v18-content-attachment-projection.md
```

## Closeout

Content can now be projected as typed attachment payloads over visible node and
edge owners. Slice 24 should route content OID and metadata reads through this
projection while preserving public behavior.

## SSJS Scorecard

- Runtime-backed forms: green; content attachment records are classes with
  constructor validation and `Object.freeze`.
- Boundary validation: green; `fromState()` requires a real `WarpState`.
- Behavior ownership: green; content projection lives in a named projection
  service instead of query-controller property parsing.
- Message parsing: green; no behavior branches parse message text.
- Ambient time or entropy: green; no clocks, dates, timers, or randomness.
- Fake shape trust or cast-cosplay: green; no assertions or placeholder
  `*Like` types introduced.
