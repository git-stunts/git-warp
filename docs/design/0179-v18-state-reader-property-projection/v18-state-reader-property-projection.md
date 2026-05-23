---
cycle: 0179
task_id: V18_state_reader_property_projection
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
release_home: v18.0.0
bearing_task: 31
promotes_backlog:
  - docs/method/backlog/v18.0.0/PROTO_legacy-props-as-projection.md
  - docs/method/backlog/v18.0.0/PROTO_content-attachment-plane-cutover.md
---

# V18 State Reader Property Projection

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Move state-reader property and content-metadata views onto the named
projection services so `StateReaderContext` no longer owns raw legacy
property interpretation.

## Playback Questions

- Does `StateReaderContext` stop duplicating query property decoding rules?
- Are node and edge content metadata reads sourced from the content projection
  where possible?
- Does the state reader preserve current public snapshots?
- Are direct raw-property scans reduced to a single compatibility projection
  boundary?
- Do lineage-sensitive same-patch content metadata tests still pass?

## Existing Shape

`src/domain/services/state/StateReaderContext.ts` builds node properties,
edge properties, and content metadata from raw state. It contains direct
legacy content register helpers and property-population logic.

That is now stale ownership. Content attachment projection exists, and
property projection will exist before this slice. The state reader should
compose those projections instead of duplicating them.

## Chosen Boundary

Keep `StateReaderContext` as the state-reader facade, but make it consume:

- node property projection;
- edge property projection;
- content attachment projection;
- graph record projection where visibility is needed.

The state reader remains responsible for presenting the state-reader API. It
does not own raw key decoding after this slice.

Special care is required for content metadata lineage. The content projection
already preserves same-patch metadata behavior, so the state reader must not
regress to last-register-only shortcuts.

## Non-Goals

- Do not remove content compatibility storage.
- Do not change public state-reader method names.
- Do not change snapshot serialization.
- Do not introduce a state-reader cache unless tests prove it is necessary.
- Do not move adapter parsing into domain code.

## RED Plan

Add tests that pin:

- state-reader node props match query node props through projection;
- state-reader edge props match query edge props through projection;
- node and edge content metadata preserve same-patch lineage;
- malformed legacy property keys cannot produce state-reader values outside
  the projection path.

## GREEN Plan

Refactor `createStateReader()` to build projection inputs once and pass named
projection objects into `StateReaderContext`.

Then remove duplicate raw key decoding from context methods. If some
compatibility method still needs raw state access, isolate it behind a named
temporary adapter with a backlog note and a short-lived test.

## Verification

```text
npx vitest run test/unit/domain/services/StateReaderPropertyProjection.test.ts --reporter=verbose
npx eslint src/domain/services/state test/unit/domain/services/StateReaderPropertyProjection.test.ts
npm run typecheck
npm run lint
npm run lint:sludge
git diff --check HEAD
```

## Closeout Criteria

- State-reader property and content metadata views are projection-backed.
- Duplicate content metadata extraction is removed or sharply quarantined.
- Public state-reader behavior remains compatible.
- The next slice can add property write intent nouns.

## SSJS Scorecard

- Runtime-backed forms: green when context consumes named projections.
- Boundary validation: green when raw legacy keys are interpreted once.
- Behavior ownership: green when state reader presents, projections interpret.
- Message parsing: green; no message text drives logic.
- Ambient time or entropy: green; no new ambient sources.
- Fake shape trust or cast-cosplay: green when no assertions are introduced.
