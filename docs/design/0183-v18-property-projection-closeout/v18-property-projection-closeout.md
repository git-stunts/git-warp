---
cycle: 0183
task_id: V18_property_projection_closeout
status: Planned
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

## GREEN Plan

Fix or document each remaining direct read. Update docs with precise language:
legacy property bags are compatibility projections; graph substrate facts are
node records, edge records, attachments, content records, and graph-op
algebra.

Mark the backlog item complete only if its acceptance criteria are met.

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

## SSJS Scorecard

- Runtime-backed forms: green when all public property views use projection
  records.
- Boundary validation: green when legacy decoding is bounded.
- Behavior ownership: green when closeout records source ownership clearly.
- Message parsing: green; no message parsing.
- Ambient time or entropy: green; no code that uses ambient sources.
- Fake shape trust or cast-cosplay: green when no casts are introduced.
