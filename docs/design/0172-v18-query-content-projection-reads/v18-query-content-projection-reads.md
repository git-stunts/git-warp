---
cycle: 0172
task_id: V18_query_content_projection_reads
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
completed_at: 2026-05-23
release_home: v18.0.0
bearing_task: 24
promotes_backlog:
  - docs/method/backlog/v18.0.0/PROTO_content-attachment-plane-cutover.md
---

# V18 Query Content Projection Reads

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Route public content OID, metadata, bytes, and stream reads through the typed
content attachment projection instead of re-parsing legacy `_content*`
registers in `QueryContent`.

## Playback Questions

- Do node content reads find content by projected node-owned attachment
  records?
- Do edge content reads find content by projected edge-owned attachment
  records?
- Do malformed legacy content references stay out of public content metadata?
- Do malformed MIME hints become absent metadata instead of leaking as public
  content metadata?

## Accessibility / Assistive Reading Posture

The read path still returns the same simple public content metadata shape:
`oid`, `mime`, and `size`. Tests name the malformed cases directly so the
behavior is inspectable without diagrams.

## Localization / Directionality Posture

Content storage OIDs, MIME hints, and edge labels remain protocol/storage
strings. Matching uses exact protocol identity, not locale collation.

## Agent Inspectability / Explainability Posture

Agents now have one explicit interpretation point for content attachments:
`ContentAttachmentProjection`. `QueryContent` only asks for the owner-specific
projected record and resolves blobs.

## Existing Shape

Before this slice, `QueryContent` duplicated legacy register parsing:

- node reads directly looked up `_content`, `_content.mime`, and
  `_content.size`;
- edge reads directly looked up `edge:_content*` registers and repeated edge
  birth visibility checks;
- MIME validation allowed any string, including malformed empty strings.

Slice 23 introduced typed projection but did not route public reads through it.

## Chosen Boundary

`QueryContent` now asks `ContentAttachmentProjection.forNode()` and
`ContentAttachmentProjection.forEdge()` for typed content attachment records
and then performs only public read duties:

- select a node-owned or edge-owned record;
- translate runtime-backed payload nouns into `ContentMeta`;
- resolve blob bytes or blob streams from the selected content OID.

The projection also skips malformed legacy content OID strings before record
construction so public reads receive `null` instead of throwing on corrupt
legacy state. Whole-state `fromState()` remains available for deterministic
materialization views, but point reads use targeted selectors to avoid a
whole-graph projection scan per lookup.

## Non-Goals

- Do not change content write storage yet.
- Do not remove legacy `_content*` compatibility properties.
- Do not route general property-bag reads through attachment projection yet.
- Do not close the content-cutover backlog note.

## RED

Observed before GREEN:

```text
test/unit/domain/services/ContentAttachmentProjection.test.ts failed because
malformed legacy content OIDs still reached ContentAttachmentOid construction.

test/unit/domain/services/controllers/QueryContentProjectionReads.test.ts
failed because
QueryContent returned empty content OIDs and empty MIME strings directly from
legacy registers.
```

## GREEN

The slice removes the raw content-register parser from `QueryContent`, routes
content reads through `ContentAttachmentProjection`, and adds regression tests
for:

- malformed node content storage references;
- malformed edge content storage references;
- malformed node MIME hints;
- malformed edge MIME hints;
- projection-level malformed content OID exclusion.

## Verification

```text
npx vitest run test/unit/domain/services/ContentAttachmentProjection.test.ts test/unit/domain/services/controllers/QueryContentProjectionReads.test.ts test/unit/domain/services/controllers/QueryController.test.ts --reporter=verbose
npx eslint src/domain/services/ContentAttachmentProjection.ts src/domain/services/controllers/QueryContent.ts test/unit/domain/services/ContentAttachmentProjection.test.ts test/unit/domain/services/controllers/QueryContentProjectionReads.test.ts
npm run typecheck
npm run lint
npm run lint:sludge
npm run lint:quarantine-graduate
npx markdownlint-cli2 CHANGELOG.md docs/BEARING.md docs/design/0172-v18-query-content-projection-reads/v18-query-content-projection-reads.md
git diff --check HEAD
```

## Closeout

Public content reads now sit on the typed content attachment projection. Slice
25 can make content writes construct typed content attachment intent before
lowering to the same legacy compatibility registers.

## SSJS Scorecard

- Runtime-backed forms: green; public reads use targeted
  `ContentAttachmentRecord` selectors and runtime-backed content payload nouns.
- Boundary validation: green; malformed content OIDs and MIME hints are
  excluded at projection time.
- Behavior ownership: green; attachment interpretation belongs to
  `ContentAttachmentProjection`, while blob I/O stays in `QueryContent`.
- Message parsing: green; no behavior branches parse message text.
- Ambient time or entropy: green; no clocks, dates, timers, or randomness.
- Fake shape trust or cast-cosplay: green; this slice removes
  content-register assertions from `QueryContent`.
