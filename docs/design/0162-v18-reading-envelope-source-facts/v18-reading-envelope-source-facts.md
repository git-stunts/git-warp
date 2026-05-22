---
cycle: 0162
task_id: V18_reading_envelope_source_facts
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
completed_at: 2026-05-22
release_home: v18.0.0
bearing_task: 14
---

# V18 Reading Envelope Source Facts

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Represent one git-warp read result as translated runtime-boundary reading
envelope source facts without claiming runtime-boundary projection readiness or
native Continuum witnesshood.

## Playback Questions

- Can git-warp name observer plan, observation request, source, basis, payload,
  witness reference, and evidence posture for one read result?
- Does the source-fact object require the `runtime-boundary-family` inventory
  row instead of accepting an unrelated family?
- Does it preserve the slice 12 truth that runtime-boundary is currently
  `authored-only`, not generated projection-ready?
- Does it reject native Continuum evidence posture for translated git-warp read
  facts?

## Accessibility / Assistive Reading Posture

No UI is introduced. The source-fact fields use explicit names rather than
position-dependent tuple ordering.

## Localization / Directionality Posture

No locale-sensitive UI copy is introduced. Runtime identifiers remain stable
ASCII source-fact labels.

## Agent Inspectability / Explainability Posture

Later agents can inspect a single object to answer:

- which runtime-boundary family row authorized the source-fact shape;
- which read source and basis produced the payload;
- which witness reference keeps the reading tied to git-warp evidence;
- whether a generated runtime-boundary profile is still required.

## Design

Add two domain concepts:

- `GitWarpReadingEnvelopePayloadFact` names the payload kind, payload digest,
  and optional state hash of the reading result.
- `GitWarpReadingEnvelopeSourceFacts` names the runtime-boundary family row,
  translated evidence posture, observer plan id, observation request id,
  source reference, basis reference, payload fact, witness reference, and budget
  status.

The source facts intentionally accept an authored-only runtime-boundary
inventory row. That means they are compatibility source facts for `warp-ttd`
and future Wesley profiles, not generated runtime-boundary projections.

## Non-Goals

- Do not redesign `Observer`, `QueryController`, or materialization.
- Do not add a generated runtime-boundary descriptor until Wesley has one.
- Do not claim native Continuum evidence.
- Do not make reading envelopes public product UI.

## RED

Observed first failure:

```text
npx vitest run test/unit/domain/continuum/GitWarpReadingEnvelopeSourceFacts.test.ts --reporter=verbose
Error: Cannot find module '../../../../src/domain/continuum/GitWarpReadingEnvelopePayloadFact.ts'
```

The test failed because the reading-envelope source-fact nouns did not exist
yet.

## GREEN

Implemented the source-fact classes, public exports, changelog entry, and
BEARING task 14 closeout.

## Verification

```text
npx vitest run test/unit/domain/continuum/GitWarpReadingEnvelopeSourceFacts.test.ts \
  test/unit/domain/index.exports.test.ts --reporter=verbose
npm run typecheck
npx eslint src/domain/continuum/GitWarpReadingEnvelopePayloadFact.ts \
  src/domain/continuum/GitWarpReadingEnvelopeSourceFacts.ts \
  test/unit/domain/continuum/GitWarpReadingEnvelopeSourceFacts.test.ts \
  test/unit/domain/index.exports.test.ts
npx markdownlint-cli2 CHANGELOG.md docs/BEARING.md \
  docs/design/0162-v18-reading-envelope-source-facts/v18-reading-envelope-source-facts.md
```

## Closeout

Slice 14 creates source facts for runtime-boundary reading envelopes while
keeping the inventory truth visible: runtime-boundary is authored-only and
still requires a generated Wesley profile before generated-family projection.

## SSJS Scorecard

- Runtime-backed forms: expected green; source facts and payload facts are
  classes.
- Boundary validation: expected green; raw read outputs are not parsed here.
- Behavior ownership: expected green; the runtime-boundary row comes from the
  inventory, while git-warp owns only its translated read facts.
- Message parsing: expected green.
- Ambient time or entropy: expected green.
- Fake shape trust or cast-cosplay: expected green; authored-only inventory
  status remains visible.
